---
name: v359 Temporaler Crop (Kamerafahrt im Preclip)
description: Plate-Track vor dem Preclip, mitziehender 720x720-Ausschnitt, identischer Paste-Back-Pfad im Mux, drei harte Vor-Dispatch-Stopps
type: architecture
---

## Ursache, die v359 behebt
Bis v358 lief das Face-Tracking (v357) NACH dem Preclip-Render und im Clip-Raum —
der Ausschnitt stand da bereits fest. Bewegte sich der Sprecher (belegter
Kailee-Fall), verließ das Gesicht das statische Fenster; Sync.so bekam ein Video
ohne Mund und lieferte Passthrough. Alle Gates v344–v355 waren geometrische
Einzelbild-Urteile auf ein zeitliches Problem — deshalb blockierten sie legitime
Szenen und verhinderten den Passthrough trotzdem nicht.

## Reihenfolge (verbindlich)
1. `trackFaceAcrossTurn` läuft auf der **Plate**, VOR `renderPassFacePreclip`
   (`compose-dialog-segments`, v161-Preclip-Block). Schlägt er fehl → statischer
   Preclip wie vor v359. Ein fehlender Track darf keine Szene blockieren.
2. `pass-face-preclip` verdichtet die Spur (`buildDenseTrack`) und plant mit
   `planCameraPath` (`_shared/camera-path.ts`) ein bewegtes 720×720-Fenster.
   Cache-Reuse nur bei identischem `crop_mode`.
3. `DialogTurnFaceCropVideo` rendert das Fenster per Frame entlang `cropPath`.
4. BBoxen werden gegen das jeweilige Fenster transformiert (Clip-Raum).
5. Mux (`render-sync-segments-audio-mux` → `DialogStitchVideo.CroppedOverlay`)
   klebt entlang **desselben** `cropPath` zurück. Statisches Rechteck bei
   bewegtem Crop = Schmieren über die Plate.

## Drei harte Stopps vor dem Dispatch — und nur diese drei
Keine Qualitätsschwellen, sondern nachweisbare Widersprüche:
- `bbox_count_mismatch` — Boxenzahl ≠ dekodierte Framezahl (positionsweise Zuordnung bricht).
- `bbox_out_of_clip_space` — Box außerhalb des realen Preclip-Pixelraums.
- `face_never_visible_in_speech_window` — gewichtete Containment == 0.

Alles andere bleibt Telemetrie und wird am Ergebnis entschieden
(`_shared/mouth-motion-verdict.ts`). Keine neuen Ratio-Gates einführen.

## Persistierte Felder am Pass
`preclip_crop_path`, `preclip_crop_mode` (`static` | `camera_path`),
`preclip_camera_travel_px`, `preclip_track_containment`.

## Nicht verfügbar
Dichtes lokales Tracking (OpenCV/MediaPipe) läuft nicht in Deno-Edge. Dichte
entsteht durch risikobasierte Verdichtung der AWS-Rekognition-Proben
(`planDensifyTimestamps`).
