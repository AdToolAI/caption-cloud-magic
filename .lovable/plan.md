
# Session M-2 — Bridge & Style-Reference (Block M Abschluss)

Erweitert das bestehende Hybrid-Extend-System um zwei neue Modi. Schema (`hybrid_mode` mit `'bridge'` und `'style-ref'`, `end_reference_image_url`, `hybrid_target_scene_id`) sowie die `end_image`-Logik in `compose-video-clips` (Kling 2.1 + Luma Ray-2) **sind bereits vorhanden** — wir nutzen die bestehende Infrastruktur weiter.

## Use-Cases

### 🌉 Bridge (Morphing-Übergang)
Generiert zwischen zwei existierenden Szenen A und B eine neue Szene, die optisch von Frame-A-Last → Frame-B-First morpht.
- **Engines**: nur **Kling** und **Luma** (brauchen `start_image` + `end_image`)
- Neue Szene wird **zwischen** A und B eingefügt (alle nachfolgenden `order_index` werden geshiftet)
- `hybrid_mode = 'bridge'`, `continuity_source_scene_id = A.id`, `hybrid_target_scene_id = B.id`

### 🎨 Style-Reference
Nutzt den **letzten Frame** einer Referenzszene als visuellen Stil-Anker (`reference_image_url`) für eine komplett neue Szene mit eigenem Prompt — kein nahtloser Anschluss, sondern Style-Transfer.
- **Engines**: alle (nur `start_image`/`first_frame_image` nötig)
- Neue Szene wird **am Ende** angehängt
- `hybrid_mode = 'style-ref'`, `continuity_source_scene_id = ref.id`

> Hinweis: Replicate's `kwaivgi/kling-v2.1` unterstützt aktuell **kein** dediziertes `reference_video`-Feld. Style-Ref nutzt daher den Last-Frame als Image-Anker (qualitativ ähnlicher Effekt, deutlich günstiger).

---

## Implementierung

### 1. Backend — `hybrid-extend-scene` erweitern (kein neues Edge-Function nötig)
- Akzeptiere `mode: 'forward' | 'backward' | 'bridge' | 'style-ref'`
- **Bridge**: zusätzlicher Pflicht-Param `targetSceneId`
  - Validiere: beide Szenen gehören zum Projekt, beide haben `clip_url`
  - Engine muss in `BACKWARD_CAPABLE` (Kling/Luma) sein
  - Extrahiere parallel: `last_frame` von A, `first_frame` von B (über bestehendes `extract-video-frames`)
  - Insert neue Szene **zwischen** A und B: `order_index = A.order + 1`, vorher zwei-Phasen-Shift aller Szenen mit `order_index >= A.order + 1` (gleiche Negative-Space-Technik wie im FCPXML-Import, um Unique-Index-Konflikte zu vermeiden)
  - Setze `reference_image_url = anchorA`, `end_reference_image_url = anchorB`, `hybrid_target_scene_id = B.id`
- **Style-Ref**: nutzt `sourceSceneId` als Referenz, extrahiert `last_frame`, append am Ende, kein `end_image`

### 2. Hook — `useHybridExtend.ts`
- Erweitere `HybridMode` um `'bridge' | 'style-ref'`
- Param `targetSceneId?: string` für Bridge
- Bridge-Validierung: zeige Toast wenn Engine nicht Kling/Luma

### 3. UI — `HybridExtendDialog.tsx`
- TabsList von 2 auf **4 Tabs** erweitern: Forward / Backward / **Bridge** / **Style-Ref**
- **Bridge-Tab**:
  - Select „Ziel-Szene" (Liste aller anderen Szenen mit `clip_url`, sortiert nach `order_index`)
  - Engine-Selector beschränkt auf Kling/Luma (Disabled-Hint wie bei Backward)
  - Cost-Preview gleich wie Backward
- **Style-Ref-Tab**:
  - Hinweis-Box: „Nutzt den Stil der Quelle, generiert eine neue Szene"
  - Engine-Selector: alle 5 Engines erlaubt
  - Prompt ist der primäre Input (Style wird nur referenziert)
- i18n: alle neuen Strings in DE/EN/ES (Bridge, Style-Ref, Ziel-Szene, Hinweise)

### 4. Storyboard-Integration — `StoryboardTab.tsx` & `SceneCard.tsx`
- Übergebe `availableScenes` (Array aller Szenen mit `clip_url`) an `HybridExtendDialog` für die Ziel-Szenen-Auswahl
- `SceneCard.tsx`: 
  - **Bridge-Button** (🌉 Icon) erscheint, wenn die Szene **nicht die letzte** ist und mind. eine andere Szene mit `clip_url` existiert → öffnet Dialog im Bridge-Tab mit Quelle = aktuelle Szene
  - **Style-Ref-Button** (🎨 Icon) immer sichtbar wenn `clip_url` vorhanden → öffnet Dialog im Style-Ref-Tab
  - Continuity-Badge erweitern: `bridge` zeigt „🌉 Bridge", `style-ref` zeigt „🎨 Style"

### 5. Persistence — `useComposerPersistence.ts`
- Mapping ist bereits da (`hybridMode`, `hybridTargetSceneId`, `endReferenceImageUrl`) — nur sicherstellen, dass `'bridge'` und `'style-ref'` als gültige Werte durchgereicht werden (Type schon entsprechend gesetzt).

### 6. Refund-Sicherheit
- `compose-video-clips` deduktet/refunded Credits bereits selbst → Bridge & Style-Ref erben das automatisch.
- `markSceneFailed` in `hybrid-extend-scene` deckt Frame-Extraktions-Fehler ab.

---

## Geänderte / neue Dateien
- `supabase/functions/hybrid-extend-scene/index.ts` (Modified — Bridge + Style-Ref Branches)
- `src/hooks/useHybridExtend.ts` (Modified — `HybridMode` Union + `targetSceneId`)
- `src/components/video-composer/HybridExtendDialog.tsx` (Modified — 4 Tabs + Ziel-Szenen-Selector + i18n)
- `src/components/video-composer/SceneCard.tsx` (Modified — Bridge/Style-Ref Buttons + Badges)
- `src/components/video-composer/StoryboardTab.tsx` (Modified — `availableScenes` Prop weiterreichen)

**Keine Migration nötig** — Schema unterstützt bereits alle 4 hybrid_mode Werte.

---

## Geschätzter Aufwand
~2 h. Nach Approval implementiere ich alles in einem Durchgang.

**Soll ich loslegen?**
