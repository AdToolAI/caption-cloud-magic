---
name: v68 4-speaker single-face preclip
description: For 3+ speaker dialog scenes, render a single-face SQUARE CROP preclip via Remotion Lambda (DialogTurnFaceCropVideo) BEFORE Sync.so dispatch. Sync.so sees one face → auto_detect is unambiguous → no provider_unknown_error. Audio-mux overlays the lipsynced crop back at preclip_crop on the master plate via the existing DialogStitchVideo crop shot type.
type: architecture
---

## Symptom (Juni 2026)

4-Personen-Dialog-Szene (`a59a380d…`, 9s Plate) scheiterte reproduzierbar
in jeder Sprecher-Pass-Variante mit `provider_unknown_error`:
- `coords-pro` (lipsync-2-pro + single coord) → FAILED
- `coords-pro-box` (sync-3 + per-frame bbox) → FAILED
- `sync3-coords` (sync-3 + single coord) → FAILED

v66 (sync_mode tight-gated) und v67 (frame-exact slice) waren bereits
korrekt aktiv — `sync_mode=cut_off`, Tight-WAV-Dauern stimmten, alle
Audio-Inputs OK. Sync.so lehnte trotzdem alle 12 Versuche (4 Passes × 3
Retries) ab.

## Root Cause

Der v5 Fan-Out Pfad schickt Sync.so weiterhin die **komplette
4-Gesichter-Scene-Plate** als Video-Input und versucht über
`active_speaker_detection` nur ein Gesicht anzusprechen. Sync.so (egal ob
lipsync-2-pro oder sync-3) gibt bei dieser Eingabe in ~100% der Fälle
`"An unknown error occurred."` zurück, ohne `error_code`, ohne weitere
Diagnose.

Das v21 Legacy-Pipeline-Pattern hatte das bereits gelöst: pro Sprecher
einen tighten **Single-Face-Square-Crop** via Remotion Lambda rendern und
diesen kleinen Crop an Sync.so schicken. Dann hat Sync.so nur EIN Gesicht
zu sehen — `auto_detect:true` ist eindeutig.

Der v5 Fan-Out hatte diese Stufe nie integriert, weil
`compose-dialog-segments` `dialog_shots.passes[]` schreibt, während
`render-dialog-turn` `dialog_shots.shots[]` (v4 Schema) verwendet.

## v68 Fix

1. **Neuer Shared Helper `_shared/pass-face-preclip.ts`**
   - `renderPassFacePreclip()` rendert pro Pass synchron einen
     512×512-Single-Face-Crop via `DialogTurnFaceCropVideo` über
     `invoke-remotion-render`.
   - Pollt `video_renders.video_url` alle 2s bis zu 90s.
   - Liefert `preclipUrl`, `crop` (x/y/size in Master-Pixel-Space),
     `preclipRenderId` zurück.
   - Idempotent: Caller speichert `preclip_url` + `preclip_crop` auf
     dem Pass; bei Retries wird die Lambda nicht erneut gestartet.

2. **`compose-dialog-segments` Integration**
   - Direkt nach dem Tight-Audio-Block, vor der Sync.so-Dispatch:
     `wantPassPreclip = speakers.length >= 3 && plateDims && pass.coords && tightAudioInfo`.
   - FaceMap-BBox wird aus dem bereits aufgelösten `faceMap` extrahiert
     und in Plate-Pixel-Space rescaled, sodass `computeFaceCrop()`
     einen sauberen Head+Shoulders-Crop produziert.
   - Bei Erfolg: `pass.preclip_url`, `pass.preclip_crop`,
     `pass.preclip_render_id` persistiert.
   - Dispatch swappt: `videoInput.url = preclip_url`,
     `active_speaker_detection = { auto_detect: true }`.
   - Bei Preclip-Fail (Timeout/Lambda-Error): fällt zurück auf den
     bisherigen Full-Plate-Pfad — keine Regression für 1/2-Sprecher.

3. **`render-sync-segments-audio-mux` Compositing**
   - Wenn ein Done-Pass `preclip_crop` trägt, emittiert die Funktion
     pro Speaker-Turn ein Shot mit `crop: { x, y, size }` statt
     `faceMask: { cx, cy, radius }`.
   - `DialogStitchVideo` rendert solche Shots bereits per
     `CroppedOverlay` mit weicher Kreis-Maske über die Plate.
   - `sourceTiming: 'relative'` bleibt erhalten (Tight-Output).

4. **`sync-so-webhook` Stuck-State Fix**
   - `aliveSiblings` schließt jetzt Passes aus, die in `retrying` mit
     `retry_count >= MAX_V5_RETRIES` stehen. Ohne diesen Fix blieb die
     Szene endlos in `lip_sync_status='running'`, weil ein erschöpfter
     Sibling-Pass als „alive" zählte und das Refund+Fail blockierte.

## Verifikation

- 4-Sprecher Szene mit pre-existierender FaceMap: alle 4 Passes
  erzeugen `v68_preclip_ready`, danach Sync.so 200 OK in <60s pro Pass
  mit `auto_detect:true`. Audio-Mux Fan-In rendert Crop-Overlays.
- 1-/2-Sprecher Szenen: kein Preclip-Trigger (`speakers.length < 3`),
  identischer Pfad wie vorher.
- Preclip-Lambda-Timeout: Pass fällt durch in den Full-Plate-Pfad,
  kein neuer Failure-Modus.

## Out of Scope

- Keine Änderung an Tight-Audio-Slicing, Sync.so Retry-Ladder,
  `sync_mode`-Gating, Refund-Pfad oder UI.
- v5 Single-Speaker und 2-Speaker bleiben auf Full-Plate +
  `coords-pro`/`auto_detect` (war bereits stabil).

## Regel (FROZEN-INVARIANT-Kandidat)

Bei `speakers.length >= 3` darf Sync.so im v5 Fan-Out NIE die komplette
Multi-Face-Scene-Plate als `input[].video` bekommen. Provider-Input MUSS
speaker-isoliert sein (Single-Face-Preclip). Fallback nur erlaubt,
wenn der Preclip-Render fehlschlägt.
