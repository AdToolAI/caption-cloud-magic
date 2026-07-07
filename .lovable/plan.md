## Problem

Zwei sichtbare Symptome, ein gemeinsamer Root-Cause:

1. **„Sprecher 3 sagt etwas, was nicht im Skript stand"** — Sync.so lippt den falschen Mund, weil der aktuelle Dispatch die **volle Multi-Face-Plate** an Sync.so schickt (`v153.2_unified_bbox_primary` — "bbox-url-pro SINGLE PATH, no preclip"). ASD ordnet die bounding_boxes aus der URL potenziell nicht 1:1 zu `pass.speaker_idx` → falscher Sprecher animiert.
2. **Leichte Morphs bei jedem Sprecher** — Sync.so reprojiziert bei Full-Frame-Dispatch das gesamte Gesicht (nicht nur Lippen) minimal; DialogStitchVideo-Masken v198 kaschieren das nur teilweise, weil unter der Maske eben doch ein leicht abweichender Sync.so-Frame liegt.

Der v169-Guide beschreibt explizit den **Per-Speaker-Preclip-Pfad** (§7.3): jeder Pass bekommt einen eigenen, tight-cropped Single-Face-Preclip als `input_url`, ASD ist deterministisch (`frame_number + coords` oder `bounding_boxes_url` auf **einem** Gesicht). v148/v153 haben diesen Pfad zugunsten eines Full-Plate-Shortcuts deaktiviert — das ist die Regression.

## Fix — v169-Preclip-Pfad reaktivieren

Ziel: `compose-dialog-segments` schickt pro Pass wieder einen Per-Speaker-Preclip an Sync.so, nicht die Full-Plate.

### Änderungen in `supabase/functions/compose-dialog-segments/index.ts`

1. **v153.2-Bypass abschalten** (~Zeile 4090–4170)
   - Das `v153.2_unified_bbox_primary` "SINGLE PATH"-Guardrail wird deaktiviert: kein automatisches `bbox-url-pro` auf Full-Plate als First-Dispatch mehr.
   - `firstDispatchVariant` wird auf `preclip_coords_doc_strict` (Preclip + `auto_detect:false, frame_number+coordinates`) gesetzt — der v169 §5/§7.3-Pfad.

2. **Preclip-Rendering wieder als Default aktivieren** (~Zeile 4489–4590, `usePassPreclip`-Gate)
   - `usePassPreclip = true` für **alle** N ≥ 1 (nicht mehr an `retry_variant` gebunden).
   - `pass-face-preclip.ts` läuft für Pass 0..cap synchron vor Dispatch, Pass cap..N via v167 Pre-Fanout im Hintergrund (`EdgeRuntime.waitUntil`).
   - Preclip-Bucket bleibt `dialog-plates/preclips/<scene>/sp<idx>.mp4`.

3. **ASD-Payload pro Preclip** (~Zeile 4570–4600 + `_shared/asd-strategy.ts`)
   - Auf dem Single-Face-Preclip: `{ auto_detect: false, frame_number: <plate-frame>, coordinates: [cx, cy] }` (zentriert auf das eine Gesicht im Crop).
   - `bounding_boxes_url` fällt für den Preclip-Pfad weg — dort gibt es nur ein Gesicht.
   - Multi-Speaker-Guard (Zeile 5909) bleibt scharf: `auto_detect:true` weiter verboten für N ≥ 2.

4. **v153-Wire-Overwrite-Assert entschärfen** (~Zeile 6224–6231)
   - Der Assert "v153 set bbox-url-pro but ASD was rewritten to auto_detect before wire" bleibt aktiv, aber der Trigger wird umgedreht: Wir *wollen* jetzt Preclip + Coords, nicht bbox-url-pro. Log-Message auf "v199_preclip_coords_primary_active" umbenennen.

5. **Retry-Ladder unverändert** (§6 im Guide)
   - Slot 0 wird nur umbenannt: `bbox-url-pro` bleibt als Retry-Escape für pathologische Preclip-Failures, aber ist nicht mehr First-Dispatch.
   - `MAX_SHOT_RETRIES=4`, `RETRY_TEMPERATURES=[0.5, 0.35, 0.7, 0.4]` bleiben.

### Erwartete Nebenwirkung auf DialogStitchVideo

Sobald Sync.so nur noch ein Gesicht sieht, verschwindet die Full-Frame-Reprojection auf den anderen Sprechern → die aktuellen v198-Masken (55/56% Radius) haben genug Puffer und die Rest-Morphs sind weg, **ohne** weitere Composer-Änderungen. Kein Touch an `DialogStitchVideo.tsx` in diesem Plan.

### Log-Marker

Neuer Grep-Tag: `v199_preclip_coords_primary` in compose-dialog-segments, sync-so-webhook, syncso_dispatch_log (`meta.dispatch_video_kind='preclip'`, `meta.payload_summary.options.active_speaker_detection.frame_number` gesetzt, `bounding_boxes_url` **nicht** gesetzt).

### Memory-Update

- Neue Memory-Datei `mem/architecture/lipsync/v199-preclip-primary-restoration.md` mit dem Rationale, warum v148/v153 zurückgerollt wurde.
- Update von `mem://architecture/lipsync/v126-unified-preclip-pipeline.md` — der v126-Kontrakt wird explizit wieder Default.

## Was NICHT geändert wird

- `sync-so-webhook` (Retry-Ladder + Idempotenz bleibt intakt).
- `render-sync-segments-audio-mux` (v197 Silent-Windows bleiben).
- `DialogStitchVideo.tsx` v198-Masken (bleiben als Sicherheitsnetz).
- Preisformel `ceil(durSec) × 9 × N_passes` (unverändert).
- v168 Per-Pass-Lock, v167 Preclip-Pre-Fanout, v166 Anchor-Identity-Bridge (alle bleiben aktiv — sie sind Voraussetzung für den Preclip-Pfad).

## Validierung nach Deploy

- Neue 3-Sprecher-Testszene rendern.
- `syncso_dispatch_log` prüfen: jede Row muss `meta.dispatch_video_kind='preclip'` haben, Payload muss `frame_number + coordinates` enthalten, **keine** `bounding_boxes_url`, **kein** `auto_detect:true`.
- Visuell: kein Wrong-Speaker mehr, keine sichtbaren Morphs auf inaktiven Sprechern.

## Rollback

Ein Feature-Flag `composer.force_v153_bbox_primary=true` in `system_config` schaltet den v153.2-Pfad in einer Row-Sekunde zurück, kein Deploy nötig.
