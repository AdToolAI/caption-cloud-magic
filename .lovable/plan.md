## v155 — Rekognition als Primary in der Dialog-Plate-Detection

**Korrektur zur vorherigen Annahme:** AWS Rekognition ist bereits voll integriert (`_shared/face-detect-mediapipe.ts`, Secrets `AWS_ACCESS_KEY_ID/SECRET/REGION` vorhanden, SigV4-Signer fertig, im `syncso-preflight` als Snap-Layer aktiv). Es wird nur **in der Dialog-Pipeline noch nicht genutzt** — `compose-dialog-segments` → `plate-face-detect.ts` ruft heute nur Gemini auf. Genau der Pfad, der den 4-Speaker-Bug ausgelöst hat.

### Was wirklich zu tun ist

Klein, chirurgisch, kein neuer Secret, keine neue Lib.

**1. `_shared/plate-face-detect.ts` — neuer Primary Path**

Vor dem Gemini-Aufruf:
```ts
import { detectFacesMediaPipe } from "./face-detect-mediapipe.ts";

const rek = await detectFacesMediaPipe({
  videoUrl: "", durationSec: 0,           // unused
  plateWidth: W, plateHeight: H,
  prebuiltFrameUrls: [plateFrameUrl],     // bereits extrahierter Plate-Frame
});

if (rek.ok && rek.faces.length >= expectedCount) {
  // Map MediaPipeFace → PlateIdentityFace
  // Wichtig: center = landmarks.mouth (wenn vorhanden) statt bbox-center
  return { faces: mapped, provider: "aws_rekognition" };
}
// sonst → bestehende Gemini-Logik (Flash → Pro + Geometry-Gate)
```

**2. Mund-Landmark-Verwendung**

`MediaPipeFace.landmarks.mouth` ist heute schon befüllt aus Rekognition (`Landmarks: MouthLeft/Right/Up/Down`). In `compose-dialog-segments` → wo `speakerCoords[idx] = plateFace.center` gesetzt wird: wenn `provider === "aws_rekognition"` und `landmarks.mouth` vorhanden, nutze den Mund-Punkt statt bbox-center. Dadurch sitzt die Sync.so-faceMask exakt auf dem Mund statt 80–120px darüber.

**3. `plate_face_cache` Spalten**
```sql
ALTER TABLE plate_face_cache
  ADD COLUMN IF NOT EXISTS detection_provider TEXT,
  ADD COLUMN IF NOT EXISTS mouth_landmarks JSONB;
```
Bestehender v154-Cache bleibt valid (provider NULL = gemini-legacy).

**4. Validation**
- Rekognition-Konfidenz < 90 → Fallback Gemini
- v154 Geometry-Gate bleibt aktiv (Schutz für den Gemini-Fallback-Pfad)
- Logs: `v155_rekognition_primary_hit` / `v155_rekognition_fallback_to_gemini` (mit reason)
- Pro Pass log `v155_mouth_landmark_delta` (Abstand bbox-center ↔ mouth-landmark) — Erfolgs-Telemetrie

**5. Version-Bump** `compose-dialog-segments` → `v155`

### Was NICHT geändert wird

- Keine neuen Secrets (AWS_* sind schon da)
- Kein neuer SigV4-Code (face-detect-mediapipe.ts ist fertig)
- ASD `bounding_boxes_url`-Format bleibt
- sync-3 Doc-Strict, Refund-Logik bleiben
- v154 Flash→Pro + Geometry-Gate bleibt als Fallback

### Verifikation nach Implementierung

Re-Run Szene `cea5be34-…`:
- Logs zeigen `v155_rekognition_primary_hit count=4 conf=[95..99]`
- Frame-Extraction pro Sprecher-Turn zeigt Mask exakt am Mund
- `v155_mouth_landmark_delta` sollte 60–120px y-shift gegenüber bbox-center zeigen (= Beweis dass es geholfen hat)

### Aufwand

~150 Zeilen Diff in `plate-face-detect.ts` + ~20 Zeilen in `compose-dialog-segments` + Migration. Ein Edge-Function-Deploy. Keine User-Action nötig.
