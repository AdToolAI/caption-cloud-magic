---
name: v158 sync-3 face-target stabilization
description: sync-3-only fix for multi-speaker animorphs — anchor-dim-aware coord mapping, mouthDown landmark, persisted mouth rehydration on advance
type: feature
---

# v158 — sync-3 Face-Target Stabilization (kein Modellwechsel)

Wir bleiben bewusst auf `sync-3` mit `active_speaker_detection.bounding_boxes_url`.
Kein `lipsync-2-pro`, kein `auto_detect`-Fallback. v158 behebt drei sich gegenseitig
verstärkende Bugs, die in v156/v157 alle vier Sprecher in einer 4-Personen-Szene
morphen ließen.

## Bugs in v156 / v157

1. **Anchor-vs-Plate Aspect Mismatch (kritisch)**
   - AWS Rekognition liefert `BoundingBox` und Landmarks normalisiert (0..1)
     relativ zur *submitted image's eigenen Pixelmaßen*.
   - v156/v157 multiplizierten direkt mit `plateWidth/plateHeight` und nahmen
     implizit identische Pixelmaße an. Anchor ist häufig 1024×1024, Plate
     1376×768 → Face- und Mouth-Koordinaten verschoben → Animorphs.

2. **Mouth-Landmark First-Wins**
   - `mouthLeft`/`mouthRight`/`mouthDown` ohne garantierte Reihenfolge.
   - Erstes gefundenes Mouth-Landmark gewann; oft `mouthLeft`/`mouthRight`.
   - Sync.so-Anker landete seitlich auf dem Mundwinkel.

3. **Persisted Mouth Loss auf Advance-Pässen**
   - Pass 2–4 laufen `advance=true`, hydrieren nur `bboxes`, nicht `mouth`.
   - `speakerPlateMouths[i]` blieb `null` → Tight-Box fiel auf
     Bbox-Anker (`by1 + h*0.66`) zurück → Hals/Schulter statt Lippen.

## v158 Fixes

### A. `_shared/face-detect-mediapipe.ts`
- Neue `decodeImageDims(bytes)` parst PNG IHDR und JPEG SOF Marker.
- In `detectFacesMediaPipe` werden Anchor-Pixelmaße aus den Bytes decodiert
  und an `callRekognition` als Multiplikator gegeben. Per-axis Skalierung
  in Plate-Space (`sx = W/iw`, `sy = H/ih`).
- Bei Aspect-Mismatch >2% loggt `v158_anchor_plate_aspect_mismatch`,
  sonst `v158_anchor_dim_scale`.
- Mouth-Landmark Auswahl deterministisch:
  1. `mouthDown` (Lippenmittelpunkt unten),
  2. sonst Centroid `(mouthLeft + mouthRight) / 2`,
  3. sonst einzelnes verbleibendes Mouth-Landmark.

### B. `compose-dialog-segments/index.ts`
- `COMPOSE_DIALOG_SEGMENTS_VERSION = "v158"`. BOOT- und WIRE_PAYLOAD-Logs
  stempeln `version=v158`.
- Persisted Hydration setzt `speakerPlateMouths[i]` aus:
  1. `plate_identity.mouths[i]` (kanonisch ab v158),
  2. sonst `plate_identity.faces[i].mouth` (Backwards-Compat).
- `speakerCoords[i]` bevorzugt den Mund-Anker, nicht den Bbox-Center.
- Snapshot `plate_identity.mouths[]` wird zusätzlich zu `bboxes[]`
  persistiert.
- Dispatch-Log pro Pass: `v158_sync3_face_target_box` mit
  `speaker`, `mouth_used`, `hydration` (live | persisted | missing),
  `aspect_in`, `aspect_out`, `area_pct`, `in`, `out`, `anchor`, `source`.

### C. Migration `v158_sync3_face_target_cache_evict`
- `plate_face_cache` AWS-Rekognition-Zeilen werden zum Ablauf gezwungen.
- `dialog_shots.plate_identity` der aktuellen Repro-Scene wird entfernt.

## Sync.so Vertrag (unverändert)
- Modell: `sync-3`.
- `options.sync_mode`: `cut_off`.
- `options.active_speaker_detection`:
  ```json
  { "auto_detect": false, "bounding_boxes_url": "<https json>" }
  ```
  JSON: pro Frame `[x1, y1, x2, y2]` oder `null` außerhalb der
  Sprecherfenster. Box-Geometrie: Mund-zentriert, Breite 90% der erkannten
  Face-Bbox-Breite, Höhe 55% davon.

## Akzeptanzkriterien
- Logs enthalten `version=v158` (BOOT + WIRE_PAYLOAD).
- `v158_sync3_face_target_box` für alle 4 Sprecher mit `mouth_used=true`,
  `area_pct` ~0.4–1.5%, kein `auto_detect: true` im Wire-Payload.
- Saubere Lipsync für Samuel, Matthew, Kailee, Sarah ohne Morphs.
