
# Plan v247+v248 — Reliable Lip-Sync at Scale (AWS Rekognition + Re-Zoom + NoOp-Retry)

## Ziel
Sync-Ausfälle wie in Szene `72b7bba5` (Face nur 104×108 px im 1284×718 Plate → Sync.so no-op) systematisch verhindern. Pipeline muss 1000e Renders/Tag mit variablen Kompositionen (Weitwinkel, Seitenprofile, Mehrpersonen) sauber verarbeiten.

## Root-Cause Recap
- MediaPipe liefert nur BBox, kein Mouth-Landmark → Crop wird auf Face-Center gerechnet, nicht auf Mouth-Center.
- Bei kleinem Face-Share (<0.35 im Preclip) fehlt Sync.so Auflösung im Mundbereich → status=done, aber 0 Pixel-Delta.
- Kein Post-Dispatch Verify → stille Fehler erreichen den Nutzer.

## Lösungsarchitektur (Defense-in-Depth, 3 Stufen)

### Stufe 1 — AWS Rekognition als Primär-Detektor (v248-Kern)
- **Neue Edge Function** `aws-rekognition-face-detect` (Deno + AWS SDK v3):
  - Input: `plate_url`, `frame_timestamps[]` (0.5s, 25%, 50%, 90%)
  - Output: Pro Frame `{ boundingBox, landmarks: { mouthLeft, mouthRight, mouthUp, mouthDown, nose, eyeLeft, eyeRight }, confidence, pose }`
  - Nutzt `DetectFaces` mit `Attributes=['ALL']` für Landmarks
- **Region**: `eu-central-1` (Frankfurt, DSGVO-konform, niedrigste Latenz zu Lambda-Pool)
- **Rate-Limit-Handling**: AWS default 50 TPS → interner Token-Bucket + exponential backoff; bei >40 TPS Warteschlange über `plate_face_detection_queue` Tabelle
- **Fallback-Kaskade**: AWS (primär) → MediaPipe (bestehend) → manueller Retry-Log
- **Kosten**: ~$0.001 pro Bild × 3 Frames = $0.003/Szene → in `videoPricingCatalog` als Overhead deklariert (bereits in 3× Marge gedeckt)

### Stufe 2 — Mouth-Centered Re-Zoom Preclip (v247 + AWS)
Ersetzt aktuelle Face-Center-Crop-Logik in `plate-face-detect.ts` / `compose-dialog-segments`:
- Neue Utility `src/lib/composer/computeMouthCenteredCrop.ts`:
  - Input: AWS Landmarks + Plate-Dimensionen + Ziel-Face-Share (default 0.42)
  - Berechnet Crop-Zentrum aus `(mouthLeft + mouthRight) / 2`, nicht Face-Center
  - Berechnet Crop-Größe damit Face-BBox ≥ 42% der Preclip-Fläche einnimmt
  - Clampt an Plate-Ränder ohne Face abzuschneiden (Priorität: Mund > Nase > Augen)
- **Speaker-Rechts-Szenario funktioniert weiter**: Center folgt Mund-Punkt, nicht Plate-Mitte.
- **Multi-Speaker (2×2 / Row)**: Row-Major-Sort aus v242 bleibt bestehen; pro Speaker eigener mouth-centered Crop.

### Stufe 3 — Post-Dispatch Verify + Auto-Retry/Refund
In `sync-so-webhook/index.ts`:
- Mouth-Band ffprobe-Probe (bestehende `noop_mouth_yavg` Idee):
  - Extrahiere 4 Frames aus Sync-Output, ffmpeg-crop auf Mouth-BBox (aus AWS-Landmarks), YAVG-Diff berechnen
  - Schwellwert: YAVG-Delta < 2.0 → **no-op detected**
- Auto-Retry-Policy (max 1 Retry pro Speaker/Szene):
  - Retry mit +25% Zoom auf Mouth-Center
  - Falls Retry auch <2.0 → automatischer Credit-Refund via bestehendem `lipsync_refund_ledger` + Fehler-Chip "no_op_after_retry"
- Idempotenz: `dispatch_id` als Refund-Key (verhindert Doppel-Refund)

### Stufe 4 — Observability + Skalierung
- **DB-Erweiterung** `syncso_dispatch_log`:
  - `face_share_in_preclip numeric`
  - `mouth_center_offset_px numeric`
  - `noop_mouth_yavg numeric`
  - `detector_used text` ('aws' | 'mediapipe' | 'both')
  - `retry_count int default 0`
- **Admin-Cockpit** (`/admin/lipsync-health`):
  - Live-KPIs: Detection-Success-Rate, NoOp-Rate, Auto-Refund-Rate, AWS-Latency P50/P95
  - Alarm bei NoOp-Rate >2% über 15min-Fenster
- **Load-Test-Skript**: 200 parallele Preclip-Detections gegen AWS + Fallback (verifiziert 1000/Tag Kapazität mit Spitzen 60/min)

## Sicherheiten für Skalierung (1000+ Renders/Tag)
- AWS Rekognition SLA: 99.9% verfügbar; unser Fallback auf MediaPipe deckt die 0.1%.
- Token-Bucket + Queue verhindert TPS-Limits bei Peak-Traffic.
- Refund-Automatik schützt Nutzer bei stillen Fehlern → keine Support-Eskalation nötig.
- Detector-Kaskade (aws → mediapipe → manuell) heißt: kein einzelner Ausfallpunkt.

## Rollout
1. **AWS-Secrets anfordern** (`AWS_REKOGNITION_ACCESS_KEY_ID`, `AWS_REKOGNITION_SECRET_ACCESS_KEY`, `AWS_REKOGNITION_REGION=eu-central-1`) via `add_secret`.
2. Edge Function `aws-rekognition-face-detect` + Utility `computeMouthCenteredCrop.ts` bauen, Unit-Tests (12 Fälle: klein/groß/seitlich/multi/edge).
3. `plate-face-detect.ts` und `compose-dialog-segments` auf AWS-primär umstellen, MediaPipe als Fallback.
4. `sync-so-webhook` um Mouth-Band-YAVG + Auto-Retry erweitern.
5. Migration für `syncso_dispatch_log` Spalten + Admin-Cockpit Widget.
6. Kontrollierter Re-Test: Szenen `72b7bba5` und `39a75cb6` — beide müssen "success + non-zero YAVG" liefern.
7. Shadow-Mode 24h (AWS läuft parallel, aber nur logging), dann Cutover.

## Technische Details
- **AWS SDK**: `npm:@aws-sdk/client-rekognition@3` in Deno Edge Function.
- **Frame-Extraktion für Detection**: bestehende `extractPlateFrames.ts` liefert 4 Timestamps → Buffer → base64 an Rekognition.
- **Landmark-Konsolidierung**: pro Speaker Median über 3 Frames (Robustheit gegen Blinks/Motion-Blur).
- **Character-Assignment-Lock (v242)** bleibt aktiv — AWS-Detektion ersetzt nur die Face→Crop-Berechnung, nicht die ID-Zuordnung.
- **Keine Änderungen** an: v169 Parallel-Fanout, v242 Row-Major-Sort, v246 Cast-Union-Prompt, HappyHorse/Hailuo Routing.

## Nicht Teil dieses Plans (bewusst außen vor)
- Sync.so Modell-Upgrade (separate Entscheidung)
- Wechsel des Video-Providers
- UI-Redesign der Lip-Sync-Karten

Nach Approval starte ich mit Stufe 1 (AWS-Secret-Request + Edge Function) und liefere danach Shadow-Mode-Logs bevor der Cutover erfolgt.
