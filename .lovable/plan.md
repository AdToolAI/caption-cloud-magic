## Phase 5 — "Feels Instant": Die letzten 25 % zu Artlist-Niveau

Ziel: Die wahrgenommene Geschwindigkeit verdoppeln, jede Aktion direkter machen, und die letzten Polish-Lücken schließen. Aufgeteilt in **6 Sub-Phasen**, jede einzeln deploybar und testbar.

---

### Phase 5.1 — Fast-Preview-Layer (größter Wow-Effekt)

**Was:** Parallel zum teuren HQ-Render (60–90 s) sofort eine 3-Sekunden-Low-Res-Vorschau zeigen, damit der User in <5 s sieht, ob die Komposition stimmt.

**Wie:**
- Neue Edge-Function `generate-fast-preview` mit LTX-Video (Replicate `lightricks/ltx-video`, ~3 s Latenz, 480p, kein Audio)
- Neuer `previewClipUrl` + `previewStatus` auf `ComposerScene`
- `compose-video-clips` triggert Fast-Preview UND HQ-Render parallel
- `SceneCard` zeigt zuerst Preview ("⚡ Vorschau"-Badge), tauscht sie atomar gegen HQ aus sobald fertig
- Kostenkontrolle: Fast-Preview nur bei expliziter "Quick-Check"-Aktion oder bei Generationen > 30 s Erwartungszeit

**Files:** `supabase/functions/generate-fast-preview/index.ts` (neu), `compose-video-clips/index.ts` (parallel-trigger), `SceneCard.tsx` (Preview-Slot), `video-composer.ts` (Felder)

---

### Phase 5.2 — Optimistic UI & Skeleton-Frames

**Was:** Während Generation nie mehr graue Box. Stattdessen animierter Skeleton-Frame mit Preset-Look, Style-Hint-Farben und Live-Progress-Bar.

**Wie:**
- Neue Komponente `SceneGenerationSkeleton.tsx`: Gradient-Loop mit der Brand-CI-Farbe, Style-Preset-Badge eingebrannt, Lottie-Style-Shimmer
- `SceneCard` rendert Skeleton bei `clipStatus === 'generating'` statt Spinner-Box
- ETA-Pill ("≈ 45 s") basierend auf historischem Provider-Median aus `video_creations`
- Kosten: Reine Frontend-Arbeit, keine API-Calls

**Files:** `SceneGenerationSkeleton.tsx` (neu), `SceneCard.tsx` (rendert Skeleton), `useProviderEta.ts` (neu, lokaler Median-Hook)

---

### Phase 5.3 — Seed-Lock + 4er-Variant-Grid (Reroll Pro)

**Was:** Bei jedem Reroll bekommt der User 4 Mini-Previews (gleicher Seed +/– Variation) und kann den besten auswählen — Artlist's "↻ Variant"-Button.

**Wie:**
- DB-Migration: `composer_scenes.seed INTEGER`, `seed_variations JSONB[]` (jede Variation: `{seed, previewUrl, status}`)
- `compose-video-clips` akzeptiert optionalen `seedVariations: number` (1–4) und `parentSeed`
- Neue UI-Komponente `RerollVariantGrid.tsx`: Zeigt 2x2 Grid mit Fast-Preview pro Variante (nutzt Phase 5.1!)
- "Variante übernehmen"-Button promotet die gewählte Seed zum HQ-Render
- Cost: 4× Fast-Preview = ~0.04 € pro Reroll-Session, klar gelabelt

**Files:** Migration, `compose-video-clips/index.ts` (seed-handling), `RerollVariantGrid.tsx` (neu), `SceneCard.tsx` (Reroll-Button öffnet Grid)

---

### Phase 5.4 — Auto-Pacing & BPM-Sync auf Storyboard-Ebene

**Was:** Wenn ein Music-Track ausgewählt ist, schlägt das System automatisch vor, Szenendauern an Beat-Cuts auszurichten (4/8/16-Beat-Schnitte).

**Wie:**
- Edge-Function `analyze-music-bpm` (neu): nimmt Music-URL, gibt BPM + erste Beats zurück (über `essentia.js` oder einfacher FFT-Onset-Detection in Deno)
- BPM-Resultat in `audio_tracks.bpm` (neue Spalte)
- Neue Card im `StoryboardTab`: "🎵 Auto-Pace: Szenen an 8-Beat-Cuts ausrichten" (Toggle)
- Bei Aktivierung werden alle Szenendauern auf nächstgelegene Beat-Multiplikatoren (z.B. 8 Beats = 4 s bei 120 BPM) gesnappt
- Visualisierung im Timeline-Strip: Beat-Marker als gelbe Striche

**Files:** Migration (`audio_tracks.bpm`), `analyze-music-bpm/index.ts` (neu), `AutoPacingCard.tsx` (neu), `StoryboardTab.tsx` (Integration)

---

### Phase 5.5 — Smart-Trim (Auto-Detect Lead-In-Freeze)

**Was:** i2v-Modelle (Hailuo, Kling, Wan, Sora) freezen die ersten 0.3–0.6 s auf dem Reference-Frame. Aktuell setzt man `clipLeadInTrimSeconds` manuell. Phase 5.5 macht das automatisch.

**Wie:**
- Edge-Function `detect-lead-in-trim` (neu): Lädt Clip, extrahiert Frame 1, 5, 10, 15 via FFmpeg-Wasm, vergleicht Pixel-Diff (über Gemini Vision oder einfach Buffer-XOR)
- Trigger automatisch nach `clipStatus === 'ready'` für i2v-Provider
- Schreibt `clipLeadInTrimSeconds` automatisch (typisch 0.2–0.5 s)
- UI-Badge "✂️ Auto-getrimmt: 0.4 s" mit Override-Slider
- Hard-Cap auf 1.0 s, damit nie zu viel weggeschnitten wird

**Files:** `detect-lead-in-trim/index.ts` (neu), `compose-video-clips/index.ts` (Auto-Trigger nach Render), `SceneCard.tsx` (Badge + Slider)

---

### Phase 5.6 — Cmd+Z Undo-Stack mit Credit-Refund

**Was:** Die letzten 10 Generationen pro Projekt sind mit Cmd+Z (Mac) / Ctrl+Z (Win) zurückrollbar inkl. automatischem Credit-Refund für die rückgängig gemachte Generation.

**Wie:**
- Neue Tabelle `composer_undo_stack`: `id, project_id, scene_id, action_type, before_state JSONB, after_state JSONB, credits_charged NUMERIC, created_at`
- Trigger in `compose-video-clips`/`generate-scene-still`: schreibt nach erfolgreichem Render einen Undo-Eintrag
- Edge-Function `composer-undo` (neu): nimmt letzten Eintrag, restored `before_state` auf der Scene-Row, ruft existierende `refund-credits` Logik
- UI: Globaler `useKeyboardShortcuts`-Hook bindet Cmd+Z, zeigt Toast "↩ Szene 3 zurückgerollt · 0.12 € erstattet"
- Stack-Limit: max. 10 pro Projekt, ältere werden hard-deleted (kein Refund mehr möglich nach 10 Aktionen)

**Files:** Migration (Tabelle), `composer-undo/index.ts` (neu), `useComposerUndo.ts` (Hook), `VideoComposerDashboard.tsx` (Shortcut-Binding)

---

### Reihenfolge & Aufwand

| Sub-Phase | Aufwand | Wow-Faktor | Abhängigkeiten |
|---|---|---|---|
| 5.1 Fast-Preview | L | ⭐⭐⭐⭐⭐ | — |
| 5.2 Skeleton-Frames | S | ⭐⭐⭐ | — |
| 5.3 Seed-Lock-Reroll | M | ⭐⭐⭐⭐ | nutzt 5.1 |
| 5.4 BPM-Auto-Pacing | M | ⭐⭐⭐ | — |
| 5.5 Smart-Trim | S | ⭐⭐ | — |
| 5.6 Undo-Stack | M | ⭐⭐⭐ | — |

**Empfohlene Reihenfolge:** 5.2 → 5.1 → 5.3 → 5.5 → 5.4 → 5.6
(Erst Skeleton bauen weil es das visuelle Fundament für Fast-Preview ist; dann Fast-Preview; dann Seed-Reroll der Fast-Preview nutzt; dann die Polish-Layer.)

---

### Was Phase 5 NICHT macht (bewusst)

- Kein eigenes hostendes ML-Modell (zu teuer, zu komplex) — wir nutzen Replicate-Hosted LTX
- Keine WebGL-Echtzeit-Vorschau (würde 6 weitere Wochen dauern, ROI fraglich)
- Keine Multi-User-Live-Collab über Cursor hinaus (haben wir schon)

### Nach Phase 5

```text
Artlist-Niveau:    ████████████████████ 100%
Wir nach Phase 5:  ████████████████████ ~95%
```

Die letzten 5 % sind Provider-Latenz (LTX-Cold-Starts auf Replicate, Lambda-Bundle-Loads) — das ist Plattform-Bedingt und nur durch eigene GPU-Infrastruktur lösbar (out of scope).

---

**Empfehlung:** Mit **Phase 5.2 (Skeleton-Frames)** starten — kleine Files, kein Backend, sofort sichtbarer Polish. Dann **Phase 5.1 (Fast-Preview)** als Hauptfeature. Soll ich mit 5.2 anfangen?