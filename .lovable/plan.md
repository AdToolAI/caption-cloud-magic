# v156 — Anchor-First Detection: AWS Rekognition direkt, kein Frame-Extract

## Diagnose

Live-Logs (Scene `3c1e8270…`):
```
v155_frame_extract replicate threw: POST .../lucataco/ffmpeg-extract-frame/predictions → 404
v155_rekognition_fallback_to_gemini reason=no_prebuilt_frame_url
```

→ Rekognition wird nie erreicht → Gemini halluziniert bei 4 Sprechern → v154-Gate killt → „Lip-Sync abgebrochen".

Root Cause auf Code-Ebene: `replicate.run("lucataco/...")` trifft den Official-Endpoint, lucataco ist Community → 404. Reparieren würde funktionieren — aber Replicate als Frame-Extractor ist ein Workaround, kein Design.

## Strategie: Anchor-First

Jede Plate entsteht aus einem **i2v-Call mit Anchor-Frame** (PNG/JPG). Der Anchor liegt bereits in `composer_scenes.lock_reference_url` / `reference_image_url` und ist im Scope von `compose-dialog-segments` schon verfügbar (Zeile 1163). AWS Rekognition läuft direkt auf dem Anchor → **0 ms Extract, kein Vendor, kein Polling, kein 404-Risiko, bessere Detection-Qualität** (kein Motion-Blur, keine i2v-Kompressionsartefakte).

```
Heute:   plate.mp4 → Replicate-Extract → JPEG → AWS Rekognition
v156:    anchor.jpg (schon da) → AWS Rekognition direkt
```

Geometrisch identisch: Anchor und Plate haben dieselbe Komposition. Kopfdrift im i2v <50 px, Sync.so-Maske ~200 px → Mouth-Landmark passt exakt.

## Konkrete Änderungen

### 1. `_shared/plate-face-detect.ts`
- **Neuer Parameter** `anchorUrl?: string` in `detectPlateFaces`.
- `extractPlateFrameForRekognition` → **gelöscht**. Komplett. Inklusive `REK_FRAME_MODEL`, `Replicate`-Import wenn unbenutzt.
- Neue Detection-Reihenfolge:

  ```
  1. Cache (key bleibt plate_url_hash)
  2. if (anchorUrl) → AWS Rekognition auf anchorUrl
  3. else (Legacy-Szenen ohne Anchor) → AWS auf erstes Plate-Frame via
     simpler Range-Request + mp4box (nur Notfall, deutliches Warn-Log)
  4. Decision Tree:
     - AWS faces.length === expectedCount + allConf ≥ 90 → ✅ use, detector="aws_rekognition_anchor"
     - AWS faces.length === 0 → Cartoon-Rescue: Gemini-Pro strict + Geometry-Gate
       - ok + count match → use, detector="gemini-2.5-pro-cartoon"
       - sonst → HARD FAIL
     - AWS 0 < faces.length < expectedCount → HARD FAIL "aws_partial_detection"
       (kein Gemini-Rescue — das war der v153/v154-Bug)
  ```

- **Gestrichen:** Gemini-Flash-Direct-on-MP4 (Zeilen 551–600). Gemini-Pro nur noch im Cartoon-Branch.
- **Behalten:** `validatePlateFacesGeometry` (auch für Cartoon-Pro).
- Cache-Key wird `anchor_url_hash` wenn Anchor genutzt, sonst weiter `plate_url_hash`. Persist `detection_provider`, `mouth_landmarks` wie heute.

### 2. `compose-dialog-segments/index.ts`
- `COMPOSE_DIALOG_SEGMENTS_VERSION = "v156"`.
- Beim Call von `resolveSceneFaceMap` → `anchorUrl` durchreichen (ist schon da, Zeile 1163–1166).
- Beim Call von `detectPlateFaces` (irgendwo in der Dispatch-Kette) → `anchorUrl` reinreichen.
- Fehler-Mapping in der UI-Toast-Message:
  - `aws_partial_detection` → „Nicht alle Sprecher klar im Bild — bitte Szene neu generieren mit klarer Trennung der Gesichter."
  - `aws_zero_faces + cartoon_rescue_failed` → „Gesichter konnten nicht erkannt werden."

### 3. Migration: Legacy-Cache evicten
```sql
UPDATE plate_face_cache
SET expires_at = now() - interval '1 second'
WHERE detection_provider IS NULL
   OR detection_provider LIKE 'gemini-2.5-flash%'
   OR detection_provider = 'gemini-2.5-pro-strict';
```
Behalten: `aws_rekognition`, neu `aws_rekognition_anchor`, neu `gemini-2.5-pro-cartoon`.

### 4. Logs (für Monitoring)
- `v156_anchor_detect_ok faces=N conf=[…] mouth=N/N anchor_url=…`
- `v156_anchor_missing → mp4_fallback` (sollte selten sein, Legacy)
- `v156_aws_partial faces=N expected=M → HARD_FAIL` (kein Gemini-Versuch)
- `v156_aws_zero_faces → cartoon_rescue_attempt`
- `v156_cartoon_rescue_ok faces=N` / `v156_cartoon_rescue_fail reason=…`

### 5. NICHT angefasst
- `face-detect-mediapipe.ts` (AWS-SigV4-Pfad ist korrekt).
- `extract-video-frames` / `extract-video-last-frame` (Hybrid-Extend / Continuity, separate Cleanup).
- AWS-Secrets, Region-Resolver, DB-Schema von `plate_face_cache`.

## Akzeptanzkriterien
- **Realszene (4 echte Sprecher):** `v156_anchor_detect_ok faces=4`, kein Replicate-, kein Gemini-Call. Sync läuft.
- **Cartoon (4 animiert):** `v156_aws_zero_faces → cartoon_rescue_ok faces=4`. Sync läuft.
- **Partial (2 von 4 sichtbar):** `v156_aws_partial → HARD_FAIL`, Auto-Refund, klare UI-Message. **Kein** Gemini-Rateversuch.
- **Legacy-Szene ohne Anchor:** `v156_anchor_missing → mp4_fallback` Warn-Log, dann ein-shot mp4-Decode (mp4box.js + min JPEG). Falls Decode fehlschlägt → HARD FAIL mit Hinweis „Szene neu generieren".

## Warum das der schnellste & sauberste Weg ist
- **Latenz:** spart 2–5 s pro Szene (kein Replicate-Roundtrip + Poll).
- **Reliability:** Anchor liegt im eigenen Storage, kein externer Single-Point-of-Failure.
- **Cost:** spart ~$0.001/Szene Replicate-Spend.
- **Code-Surface:** entfernt ~80 Zeilen Helper + Replicate-Dependency aus dem Hot-Path.
- **Quality:** Anchor ist artefaktfrei → höhere Rekognition-Confidence → präzisere Mouth-Landmarks → Sync.so-Maske sitzt exakter.

## Risiko: Niedrig
2 Files (`plate-face-detect.ts`, `compose-dialog-segments/index.ts`), 1 kleine Daten-Migration, kein neuer Vendor, kein neuer Secret, kein UI-Refactor.
