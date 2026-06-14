# v112 — Was `auto_detect` zu sehen bekommt verbessern

`auto_detect: true` bleibt (offiziell empfohlen für sync-3). Der Fehler liegt am **Input** in den Preclip, nicht in der Speaker-Selection-Logik.

## Beleg aus der offiziellen Sync.so-Doku

Quellen: `sync.so/docs/compatibility-and-tips/improving-lip-sync-quality`, `.../media-content-tips`.

1. **Auflösung** — "Use at least **480p resolution for reliable face detection**. Higher resolutions up to 4K supported. We recommend **1080p as the best balance**."
   → Unsere Preclips rendern aktuell mit `outputSize = max(256, cropSize)`, also oft **256×256**. Das liegt **deutlich unter** der Mindestanforderung. Auto-detect findet das Gesicht zwar (Crop ist face-centered), aber die Lippen-Generation hat zu wenig Pixeldichte → "COMPLETED" aber Mund bleibt sichtbar unverändert.

2. **AI-generierte Plates** — Wörtliches Zitat: *"When creating videos with third-party AI video generation models, include this instruction in the text prompt: **'the character should be speaking naturally'**. The generated AI video will have some random mouth movements, which are necessary to get the best results from our lipsync model."*
   → Unser Hailuo-i2v-Plate-Prompt enthält das aktuell **nicht**. Ohne idle-Mund-Mikrobewegungen tut sich sync-3 sehr schwer, die Lippen zu animieren — genau das beobachtete Symptom.

3. **Single face in frame** — Wird durch unseren face-zentrierten Crop bereits erfüllt; `auto_detect` ist hier korrekt und idiomatisch.

## Änderungen (gezielt, klein)

### A) Preclip-Auflösung auf ≥720p anheben

Datei: `supabase/functions/compose-dialog-segments/pass-face-preclip.ts` (Crop-Renderer / `outputSize`-Berechnung).

- Neue Regel: `outputSize = clamp(roundEven(cropSize × upscaleFactor), min=720, max=1280)`
  - Wenn `cropSize ≥ 720` → 1:1 (kein Upscale, keine Distortion).
  - Wenn `cropSize < 720` → ffmpeg-Upscale via `scale=720:720:flags=lanczos` (gleiches Seitenverhältnis 1:1 bleibt).
- v109-Lehre (kein synthetisches Mega-Upscale) bleibt gewahrt: Cap bei 1280, Lanczos statt bicubic, kein Sharpen-Filter.
- Kommentar im Code: "Sync.so docs require ≥480p for reliable face detection; we target 720p for sync-3 quality margin."

### B) "Speaking naturally"-Hint im Plate-Prompt

Datei: `supabase/functions/compose-dialog-scene/index.ts` (Hailuo-i2v-Prompt-Builder für Dialog-Plates) und/oder `supabase/functions/_shared/dialog-plate-prompt.ts`.

- Append (idempotent, einmalig) am Ende des Plate-Prompts für **alle** Dialog-Plates:
  `", the character should be speaking naturally with subtle natural mouth movements"`
- Nur Plates aus dem Dialog-Pipeline-Pfad (kein Eingriff in normale Composer-Clips).

### C) Logging zur Verifikation

In `pass-face-preclip.ts` und `sync-so-webhook` ergänzen:
- `preclip_dims: { width, height }` im `syncso_dispatch_log`
- `preclip_face_box_ratio` (Crop-Größe / Output-Größe), damit Future-Regressionen sofort sichtbar werden.

### D) Reset der betroffenen Szene

Migration: Reset `e57ef6dd-31a4-4b9d-9b49-5894d64bea7d`:
- `dialog_shots = NULL`, `clip_url = NULL`, `clip_status = NULL`, `lip_sync_status = NULL`, `twoshot_stage = NULL`, `lip_sync_applied_at = NULL`, `replicate_prediction_id = NULL`
- Credit-Refund über bestehende deterministische UUID-Logik (idempotent).
- `scene_anchor_cache`-Eintrag bleibt (Anchor ist korrekt, nur Lipsync-Plate wird neu).

### E) Memory + Deploy

- `mem/architecture/lipsync/v112-preclip-resolution-and-speaking-natural-plate.md`:
  - Offizielle Doku-Zitate (≥480p, "speaking naturally")
  - Wahl: Target 720p (Sicherheitsmarge), Cap 1280p (Cost/Latency)
  - `auto_detect: true` bleibt offizieller Default
- `mem/index.md`: Eintrag unter v111
- Deploy: `compose-dialog-segments`, `compose-dialog-scene`

## Out of Scope

- Speaker-Selection-Modus (bleibt `auto_detect: true`)
- Sync.so-Modell (bleibt `sync-3`)
- Audio-Mux / Stitcher / `audio_plan`
- Composer-Clip-Auflösungen (nur Dialog-Preclips)
- Bestehende erfolgreiche Lipsync-Renders (kein Backfill)

## Wird das das Problem wirklich beheben?

Hohe Konfidenz: **A** behebt die Hauptursache (zu kleines Inputbild für sync-3). **B** ist der zweite Doku-konforme Hebel speziell für AI-Plates. Beide werden in der offiziellen Doku explizit als Bedingungen für funktionierende Lippenbewegung genannt. **C** macht jedes künftige Regress sofort sichtbar.

Soll ich es so bauen?