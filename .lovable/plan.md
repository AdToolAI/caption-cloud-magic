
# Block M — Hybrid Production Pro

**Ziel:** User lädt ein bestehendes Video hoch und nutzt AI, um es zu **verlängern**, **rückwärts zu erweitern**, mit einem zweiten Clip per **Bridge-Übergang** zu verbinden, oder als **Style-Reference** für neue Szenen zu verwenden.

**Audit-Ergebnis:** Die Infrastruktur ist zur Hälfte schon da — `continuity_source_scene_id` und `last_frame_url` existieren bereits in `composer_scenes`, und die Engines `Hailuo`, `Kling`, `Luma` unterstützen die nötigen i2v-Parameter. Sora unterstützt kein i2v und wird für Hybrid-Modi ausgeschlossen (mit klarer UI-Sperre).

---

## Aufteilung in 2 Sessions

### Session M-1 (~3h): Forward + Backward Extend
Die zwei häufigsten Use-Cases — bauen auf bestehender Infrastruktur auf, niedrigeres Risiko.

### Session M-2 (~2h): Bridge + Style-Reference
Komplexere Modi (2 Inputs gleichzeitig), nur Kling-Engine.

---

# Session M-1 — Extend Forward & Backward

## Use-Cases

### 1. Extend Forward (Verlängern nach hinten)
- **Input:** Bestehendes Video (Upload ODER schon generierte Szene)
- **Verarbeitung:** Letzten Frame extrahieren → als `start_image` an i2v-Engine
- **Output:** Neue Szene direkt nach der Quelle, optisch nahtlos
- **Engines:** Hailuo (`first_frame_image`), Kling (`start_image`), Luma (`start_image`), Wan (`image`), Seedance (`image`)
- **UI:** Button "Forward verlängern →" auf jeder SceneCard mit `clipUrl`

### 2. Extend Backward (Verlängern nach vorn)
- **Input:** Bestehendes Video
- **Verarbeitung:** Ersten Frame extrahieren → als `end_image` (Kling/Luma) bzw. als Prompt-Hint (andere)
- **Output:** Neue Szene VOR der Quelle, endet im ersten Frame der Quelle
- **Engines:** Kling (`end_image`), Luma (`end_image`) — andere Engines fallen auf Prompt-only zurück mit Warning
- **UI:** Button "← Backward verlängern" auf jeder SceneCard mit `clipUrl`

## Architektur

### DB-Migration

```sql
ALTER TABLE composer_scenes
  ADD COLUMN IF NOT EXISTS hybrid_mode text 
    CHECK (hybrid_mode IN ('forward', 'backward', 'bridge', 'style-ref') OR hybrid_mode IS NULL),
  ADD COLUMN IF NOT EXISTS first_frame_url text,  -- für Backward-Extend
  ADD COLUMN IF NOT EXISTS hybrid_target_scene_id uuid 
    REFERENCES composer_scenes(id) ON DELETE SET NULL;  -- bei Bridge: zweite Quelle
-- last_frame_url + continuity_source_scene_id existieren bereits
```

### Edge Function: `extract-video-frames` (neu)

- **Input:** `{ videoUrl, mode: 'first' | 'last' | 'both' }`
- **Verarbeitung:** Lädt Video per `fetch`, nutzt **ffmpeg.wasm** über `esm.sh` (Deno-kompatibel) ODER ruft den bereits vorhandenen Frame-Extractor aus `compose-clip-webhook` (siehe Audit) wieder
- **Output:** `{ firstFrameUrl?, lastFrameUrl? }` — Upload in `motion-studio-library` Bucket unter `{userId}/frames/{sceneId}-{first|last}.jpg`
- **Caching:** Wenn `first_frame_url` / `last_frame_url` schon gesetzt sind, skip extraction

### Edge Function: `hybrid-extend-scene` (neu, Orchestrator)

- **Input:**
  ```typescript
  {
    projectId: string,
    sourceSceneId: string,        // existierende Szene mit clipUrl
    mode: 'forward' | 'backward',
    engine: 'ai-hailuo' | 'ai-kling' | 'ai-luma' | 'ai-wan' | 'ai-seedance',
    quality: 'standard' | 'pro',
    prompt: string,               // beschreibt was passieren soll
    duration: number,             // 4-12s je nach Engine
  }
  ```
- **Flow:**
  1. Validate ownership + engine compatibility (Backward → nur Kling/Luma support `end_image`)
  2. Call `extract-video-frames` → bekommt `firstFrameUrl` oder `lastFrameUrl`
  3. INSERT neue `composer_scenes` Row mit:
     - `hybrid_mode`: 'forward' / 'backward'
     - `continuity_source_scene_id`: sourceSceneId
     - `referenceImageUrl`: extrahierter Frame
     - `clipSource`: gewählte Engine
     - `clipStatus`: 'generating'
     - `orderIndex`: source.orderIndex + 1 (forward) bzw. -0.5 (backward, später Reorder)
  4. Trigger bestehende Engine-Function (`generate-kling-video`, `generate-hailuo-video`, etc.) mit dem korrekten Image-Param
  5. Reorder alle nachfolgenden Szenen (forward: shift +1) bzw. vorhergehenden (backward: re-sequence)
  6. Return `{ newSceneId, estimatedCostEuros }`

### Frontend: `HybridExtendDialog.tsx` (neu)

Modal das vom SceneCard-Button geöffnet wird:
- **Mode-Tabs:** "Forward verlängern" / "Backward verlängern"
- **Engine-Picker:** Dropdown mit Capability-Badges
  - Forward: alle 5 i2v-Engines verfügbar
  - Backward: nur Kling/Luma aktiv, andere ausgegraut mit Tooltip "Engine unterstützt nur Forward-Extend"
- **Preview:** Thumbnail des extrahierten Frames (links Source, rechts neuer Frame als Anchor)
- **Prompt-Field:** Mit dem `PromptTokenCounter` aus `motion-studio` (per-engine limits)
- **Duration-Slider:** 4-12s je nach Engine
- **Cost-Preview:** `getClipCost(engine, quality, duration)` Live-Berechnung
- **Generate-Button:** ruft `useHybridExtend()` Hook

### Frontend: `useHybridExtend.ts` (neu)

- `extendScene(params)` → ruft `hybrid-extend-scene` Edge-Function
- Polling auf neue Szene via Realtime-Subscription auf `composer_scenes`
- Toast bei Success/Failure mit Credit-Refund-Hinweis bei Fehler

### Frontend: SceneCard.tsx (modifiziert)

Zwei neue Buttons im Hover-Overlay (nur sichtbar wenn `clipUrl` gesetzt):
```
[← Backward extend] [Forward extend →]
```
Jeder öffnet den `HybridExtendDialog` mit vorausgewähltem Mode.

### Continuity-Marker auf Karte

Wenn `continuity_source_scene_id` ODER `hybrid_mode` gesetzt → Badge "🔗 Hybrid Forward" / "🔗 Hybrid Backward" auf der Card-Vorschau, mit Tooltip "Verlängert Szene #3"

---

## Files Session M-1

**Neu:**
- `supabase/migrations/{ts}_hybrid_extend_columns.sql`
- `supabase/functions/extract-video-frames/index.ts`
- `supabase/functions/hybrid-extend-scene/index.ts`
- `src/components/video-composer/HybridExtendDialog.tsx`
- `src/hooks/useHybridExtend.ts`

**Geändert:**
- `src/types/video-composer.ts` — neue Felder in `ComposerScene` (`hybridMode`, `firstFrameUrl`, `hybridTargetSceneId`)
- `src/components/video-composer/SceneCard.tsx` — 2 neue Buttons + Continuity-Badge
- `src/hooks/useComposerPersistence.ts` — neue Felder in `mapDbSceneToScene` und `mapSceneToDbScene`
- 3× i18n (DE/EN/ES) — Dialog-Labels, Toasts

---

# Session M-2 — Bridge & Style-Reference

## Use-Case 3: Bridge (Übergang zwischen 2 Clips)
- **Input:** Quelle A + Quelle B (beide existierende Szenen mit `clipUrl`)
- **Verarbeitung:** Letzter Frame von A → `start_image`, Erster Frame von B → `end_image`
- **Output:** Neue Szene zwischen beiden, die optisch von A nach B morpht
- **Engine:** Nur **Kling** (einziger Provider mit `end_image` UND `start_image` simultan)
- **UI:** Drag-and-Drop oder Modal mit zwei Szenen-Pickern

## Use-Case 4: Style-Reference (Style-Transfer)
- **Input:** Existierendes Video als Style-Anker + neuer Prompt
- **Verarbeitung:** Video wird als `reference_video` an Kling übergeben (Kling 1.6 unterstützt das)
- **Output:** Neue Szene im selben Look wie das Referenzvideo
- **Engine:** Nur **Kling** (`reference_video` Param)
- **UI:** "Als Style-Reference nutzen" Button auf jeder SceneCard → öffnet Dialog mit Prompt-Field

## Architektur Erweiterungen

### `hybrid-extend-scene` erweitern um Modi `bridge` und `style-ref`:
- Bridge: 2 Frames extrahieren (last von A, first von B), beide an Kling
- Style-Ref: kein Frame-Extract, nur Video-URL an Kling als `reference_video`

### `HybridExtendDialog` erweitern:
- Neue Tabs "Bridge" und "Style-Ref"
- Bridge-Tab: 2 Szenen-Picker (Source A + Source B)
- Style-Ref-Tab: Prompt + Source-Picker

### Files Session M-2
**Neu:** —
**Geändert:**
- `supabase/functions/hybrid-extend-scene/index.ts` — 2 neue Modi
- `src/components/video-composer/HybridExtendDialog.tsx` — 2 neue Tabs
- `src/hooks/useHybridExtend.ts` — 2 neue Methoden

---

# Edge Cases & Hardening

| Case | Lösung |
|---|---|
| Source-Szene ohne `clipUrl` (noch nicht generiert) | Buttons disabled mit Tooltip "Erst Szene generieren" |
| Sora als Engine ausgewählt | Tab/Option komplett ausgeblendet |
| Backward + nicht-Kling/Luma | Dropdown-Option ausgegraut + Inline-Warning |
| Extract-Frame Failure | Fallback: User kann manuell Bild hochladen via `SceneReferenceImageUpload` |
| Bridge: A und B haben verschiedene Aspect-Ratios | Pre-Check + Warnung "Bridge funktioniert am besten mit gleichem Format" |
| Style-Ref Video > 10s | Replicate-Limit → trim auf erste 5s automatisch |
| Insufficient credits | Standard `ai_video_wallets` Check VOR Frame-Extract |

---

# Sicherheit
- `verify_jwt` Validation in beiden neuen Edge-Functions
- Ownership-Check: `sourceSceneId` MUSS zu `projectId` gehören, das dem User gehört
- Frame-Storage: `motion-studio-library` Bucket nutzt `auth.uid()` als ersten Path-Segment (RLS schon aktiv)
- Refund-Mechanismus: Bei Engine-Failure → `refund_ai_video_credits()` aufrufen

---

# Vorgehen

**Erst Session M-1** komplett (Forward + Backward, 5 Engines, UI mit 2 Tabs). Manuell testen:
1. Existierende Szene generieren
2. "Forward extend" klicken, Hailuo wählen, Prompt schreiben → neue Szene erscheint nahtlos angehängt
3. "Backward extend" mit Kling testen
4. Continuity-Badge sichtbar?

Wenn alles läuft → **Session M-2** (Bridge + Style-Ref mit Kling).

---

**Soll ich mit Session M-1 starten?** Oder möchtest du noch etwas anpassen — z.B.:
- Engines reduzieren (nur Kling + Luma statt alle 5)?
- Backward-Extend weglassen (nur Forward in M-1)?
- Sora trotzdem mit Prompt-Fallback unterstützen?
