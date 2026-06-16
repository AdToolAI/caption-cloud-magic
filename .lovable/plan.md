# v127 — Center-Speaker Lip-Passthrough Fix

## Symptom (verified by user)
Scene `cba18767…`: Audio läuft, **Lippen bewegen sich nicht** für Sprecher 1 (Samuel, slotIndex 2 / center-right) und Sprecher 2 (Matthew, slotIndex 1 / center-left). Sprecher 3 (Kailee, edge-right) und 4 (Sarah, edge-left) lipsyncen sauber.

Alle 4 Passes liefen über die v126 unified Pipeline:
`preclip 720×720 + sync-3 + active_speaker_detection.auto_detect:true + sync_mode:cut_off`, `preclip_face_count=1`, `status=done`, jede mit eigenem tight-WAV + eigener output_url.

Das ist exakt das v112-Failure-Pattern: *„sync-3 returned COMPLETED but emitted the preclip unchanged"* — also **Passthrough**, kein echter Lipsync. Nur passiert er aktuell selektiv für die zwei mittleren Sprecher.

## Plan (3 Stages)

### Stage A — Forensic Probe (read-only)
Bestätige Passthrough, bevor wir an der Pipeline drehen.

1. Neue Edge Function `probe-lipsync-output`:
   - Input: `{ outputUrl, audioUrl, preclipUrl }`
   - Lädt ein 256 KiB-Segment der ersten und letzten 0.5 s beider Videos (`outputUrl` vs `preclipUrl`).
   - Vergleicht mittels Pixel-Hash (Crop auf untere Gesichtshälfte) ob die Mund-Region zwischen sync-3-Output und Original-Preclip identisch ist.
   - Schreibt Ergebnis in `dialog_shots.passes[].lip_motion_probe = { delta_score, is_passthrough, sampled_frames }`.
2. Aufruf einmalig für alle 4 Passes der betroffenen Szene → wir wissen objektiv welche passthrough'd sind.

Wir gehen nicht zu Stage B über, bevor wir wissen ob das Problem (a) Sync.so liefert wirklich Passthrough für 1+2, oder (b) Lipsync ist da, aber der Stitcher pastet falsch.

### Stage B — Passthrough-Auto-Retry mit Crop-Expansion
Wenn Stage A Passthrough bestätigt:

1. `sync-so-webhook`: Nach Sync.so `COMPLETED` direkt `probe-lipsync-output` aufrufen. Bei `is_passthrough=true`:
   - Erhöhe `retry_count` (max 2).
   - Setze `retry_variant = "preclip-wider-crop"` und `crop_expansion_factor = 1.5` (passes 1 / 2 / 3 → 1.0 / 1.5 / 2.0).
   - Clear `job_id`, `output_url`, `preclip_url` (v126 retry-clear-path).
2. `compose-dialog-segments` liest `pass.crop_expansion_factor` und übergibt ihn an `renderPassFacePreclip(..., { cropExpansionFactor })` — der Hook existiert bereits seit v116.
3. Bei `retry_count >= 2` ohne Erfolg → `status=failed`, sauberer Refund über die existierende `pass.refund_handle`.

### Stage C — Stitcher-Defense
Selbst wenn Sync.so passthrough'd: der Stitcher überlagert dann das Original. Damit der User nicht stillschweigend "lipsync done" sieht:

1. `render-sync-segments-audio-mux`: Wenn ein Pass `lip_motion_probe.is_passthrough=true` UND `retry_count` erschöpft → markiere die Szene als `lip_sync_status='partial'` und ergänze `scene.lip_sync_warning = ['passthrough', 'passthrough', …]` (pro Sprecher-Index).
2. UI (`SceneCard` / `DialogStitchPanel`): zeige einen Warn-Badge "⚠️ Sprecher X kein Lipsync — neu rendern" mit Retry-Button (ruft `reset-lipsync-scene` mit speaker-filter auf).

### Stage D — Recovery für aktuelle Szene
Nur Samuel + Matthew (passes 0, 1) auf `pending` setzen, `job_id`, `output_url`, `preclip_url` clearen, `crop_expansion_factor=1.5` setzen. Watchdog dispatched mit gewideter Crop. Kailee + Sarah bleiben `done`.

## Technical Details

**Files touched**
- `supabase/functions/probe-lipsync-output/index.ts` (neu)
- `supabase/functions/sync-so-webhook/index.ts` (Probe-Hook + Retry-Branch)
- `supabase/functions/compose-dialog-segments/index.ts` (lese `crop_expansion_factor` aus pass)
- `supabase/functions/render-sync-segments-audio-mux/index.ts` (partial-status + warnings)
- `src/components/composer/scenes/SceneCard.tsx` (Warn-Badge + per-Speaker-Retry)
- `mem/architecture/lipsync/v127-passthrough-detection-and-crop-expansion.md` (neu)
- `mem/index.md` (Eintrag)

**DB-Spalte (composer_scenes.dialog_shots JSONB)**
- pro Pass: `lip_motion_probe`, `crop_expansion_factor`, `retry_variant`
- pro Szene: `lip_sync_warning: string[]`

**Probe-Heuristik (Stage A)**
- ffmpeg via Deno-WASM oder serverless: 2 Frames bei `t=startSec+0.2s` und `t=startSec+(dur*0.7)` aus beiden Videos.
- Mundregion = unteres Drittel des Frames, mittlere 60% horizontal.
- Pixel-Diff (Y-Channel), Schwelle: mean abs diff < 4 → passthrough.
- Schwellen-Tuning kommt später; Stage A loggt rohe Werte für 4 Passes der Test-Szene.

**Nicht angefasst**
- v126 unified preclip dispatch path bleibt.
- Watchdog Logik bleibt (außer Retry mit `crop_expansion_factor` wird unterstützt).
- Refund-Pfade unverändert.

## Validation
1. Stage A für Szene `cba18767…` → erwartet `is_passthrough=true` für passes 0+1, `false` für passes 2+3.
2. Stage D Recovery → Samuel + Matthew laufen mit cropExpansionFactor=1.5; probe danach `is_passthrough=false` → grüner Mux.
3. Neuer 4-Sprecher Dialog (frische Szene) durchläuft Stage B automatisch — falls Passthrough auftritt, wird transparent retried, sonst keine Verhaltensänderung.

## Open Question für dich
Stage A (Probe) zuerst alleine deployen und Ergebnis abwarten? Oder Stages A+B+D in einem Rutsch?
