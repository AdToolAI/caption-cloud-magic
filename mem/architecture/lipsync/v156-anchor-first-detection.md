---
name: v156 Anchor-First Plate Face Detection
description: AWS Rekognition runs directly on the anchor frame (i2v input), no Replicate frame-extract; Gemini-Pro only as cartoon-rescue when AWS returns 0 faces; hard-fail on partial detection
type: feature
---

## Pipeline

```
composer_scenes.lock_reference_url / reference_image_url   ←  bereits in Storage
  → AWS Rekognition DetectFaces (bytes mode, via _shared/face-detect-mediapipe.ts)
  → mouth landmarks (MouthLeft/Right/Down midpoint) → PlateFaceBox.mouth
  → Sync.so faceMask sitzt exakt auf Mund (statt bbox-center = nose/forehead)
```

Kein Replicate, kein Frame-Extract-Roundtrip, keine 2–5s Latenz mehr. Anchor und Plate teilen Komposition (i2v drift <50 px vs. 200-px-Maske), daher passt die Detection 1:1 auf Plate-Pixel.

## Decision Tree in `detectPlateFaces`

| AWS-Ergebnis            | Aktion                                                                  | Detector-Tag                    |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| `faces === expected`    | ✅ use                                                                  | `aws_rekognition_anchor`        |
| `faces > expected`      | Top-N nach bbox-area, links→rechts re-slotted                           | `aws_rekognition_anchor`        |
| `0 < faces < expected`  | ❌ **HARD FAIL** (war v153/v154-Bug: Gemini hat fehlende Sprecher halluziniert) | `aws_rekognition_anchor` (null) |
| `faces === 0`           | Cartoon-Rescue: Gemini-2.5-Pro strict + Geometry-Gate                   | `gemini-2.5-pro-cartoon`        |
| Anchor fehlt (Legacy)   | AWS auf plate-mp4 URL (gibt fast immer 0) → Cartoon-Rescue              | `aws_rekognition_mp4_fallback`  |

## Was rausgeflogen ist

- `extractPlateFrameForRekognition` (lucataco Replicate-Call, 404)
- Replicate-NPM-Import
- `gemini-2.5-flash` direct-on-mp4 als Primary
- Pro-Recovery nach Flash-Fail (Flash-Pfad existiert nicht mehr)
- v155-Logs `v155_frame_extract_*`, `v155_rekognition_*`

## Logs

- `v156_anchor_detect_ok faces=N conf=[…] mouth=N/N anchor=…`
- `v156_anchor_detect_empty reason=…` → triggert Cartoon-Rescue
- `v156_aws_partial faces=2 expected=4 → HARD_FAIL`
- `v156_aws_over_detect raw=5 kept=4`
- `v156_anchor_missing → aws_on_mp4_fallback`
- `v156_cartoon_rescue_ok|fail`
- BOOT-Log: `version=v156`

## Cache

`plate_face_cache` Eviction-Migration läuft beim Deploy: alle Rows mit
`detection_provider IN (NULL, 'gemini-2.5-flash%', 'gemini-2.5-pro-strict')`
auf `expires_at = now() - 1s` gesetzt.
