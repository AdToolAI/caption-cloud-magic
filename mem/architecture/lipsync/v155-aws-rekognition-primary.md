---
name: v155 AWS Rekognition Primary for Dialog Plate-Face Detection
description: Dialog-Pipeline ruft jetzt AWS Rekognition als primären Face-Detector mit Mund-Landmarks. Gemini ist nur noch Fallback.
type: feature
---

## v155 — AWS Rekognition Primary in compose-dialog-segments

### Vorher (v154 und früher)
- `_shared/plate-face-detect.ts` rief `detectFacesMediaPipe` ohne `prebuiltFrameUrls`
- Helper kurzschloss sofort mit `no_prebuilt_frame_url` → Rekognition wurde nie ausgeführt
- Fallback war Gemini Flash auf mp4-URL → produzierte regelmäßig Torso-Bboxes (root cause des 4-Speaker-Bugs)

### Jetzt (v155)
1. `extractPlateFrameForRekognition` extrahiert einen Mid-Duration-JPEG via Replicate `lucataco/ffmpeg-extract-frame`, lädt ihn in `composer-frames/{projectId}/plate-rek/`
2. `detectFacesMediaPipe` läuft auf diesem JPEG → AWS Rekognition liefert pixel-genaue Bboxes + `MouthLeft/Right/Down`-Landmarks
3. `PlateFaceBox.mouth` propagiert den Mund-Landmark durch
4. `compose-dialog-segments` (Speaker-Coord-Assignment, ~Line 1416) nutzt `plateFace.mouth` als Sync.so-Mask-Center wenn vorhanden (statt bbox-center, das auf Nase/Stirn liegt)
5. Bei Rekognition-Miss (z.B. Cartoon-Avatare) → Fallback auf Gemini Flash → Pro + v154 Geometry-Gate

### DB-Schema
`plate_face_cache` hat zwei neue Spalten:
- `detection_provider TEXT` (`aws_rekognition` | `gemini-2.5-flash` | `gemini-2.5-pro-strict`)
- `mouth_landmarks JSONB` (`[{slot, mouth:[x,y]}, …]`)

Cache-Lookups bleiben Hash-basiert auf `plate_url_hash`.

### Telemetrie-Logs
- `v155_rekognition_primary_hit faces=N mouth_landmarks=M/N`
- `v155_rekognition_fallback_to_gemini reason=…`
- `v155_mouth_landmark_used speaker=i mouth=[x,y] bbox_center=[x,y] dy=…`

### Was NICHT geändert wurde
- ASD `bounding_boxes_url`-Format (Sync.so bekommt weiter pixel-bboxes für ASD, nur die `faceMask`-Center sind jetzt der Mund)
- sync-3 Doc-Strict Options
- Refund-Logik
- v154 Geometry-Gate (aktiv für Gemini-Fallback-Pfad)
- `_shared/face-detect-mediapipe.ts` (war schon Rekognition unter der Haube, Name historisch)
