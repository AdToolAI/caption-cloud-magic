---
name: v157 Tight-Mouth-Box
description: Geometry-Gate auf AWS-Rekognition-Boxen + Mund-zentrierte Sync.so-Box. Behebt "Animorph"-Morphs bei Sprecher 2-N in eng gepackten Multi-Speaker-Plates.
type: feature
---
# v157 Tight-Mouth-Box

## Problem
v156 Anchor-First lieferte AWS-Boxen mit Aspect H/W = 1.4-1.55 (Kopf+Hals+Schultern). Dispatcher hat zusätzlich +15% gepaddet → Sync.so faceMask saß auf Brust/Hintergrund → "Animorph"-Morphs bei Sprecher 2-N (Speaker 1 funktionierte zufällig wegen mehr Breathing-Room am Bild-Rand).

## Fix (3 chirurgische Eingriffe)
1. **`_shared/face-detect-mediapipe.ts`**: Cluster-Pad 10% → 0% (bei Anchor-First wird nur 1 Frame geschickt, nichts zu clustern).
2. **`_shared/plate-face-detect.ts`** (v157_geometry_tighten): jede Box mit aspect>1.35 oder h>22% Plate-Höhe wird auf w×(w*1.15) heruntergerechnet, zentriert auf das Mund-Landmark (Fallback: obere ⅓ der Bbox). Bleibt h>25% → HARD_FAIL.
3. **`compose-dialog-segments/index.ts`** (v157_tight_mouth_box, Z. ~3782): statt Bbox±15%-Pad eine schmale Lippenregion (90% × 49% in Pixel) zentriert auf das Rekognition-Mund-Landmark.

## Datenfluss
- Neuer `speakerPlateMouths` Array parallel zu `speakerPlateBboxes`, befüllt bei plate-identity hydration (Z. 1434).
- Dispatcher zieht mouth bevorzugt, fällt sonst auf bbox-anchor (unteres ⅓) zurück.

## Cache
Migration: `UPDATE plate_face_cache SET expires_at = now()-1s WHERE detector LIKE 'aws_rekognition%'` — alle alten fetten Torso-Boxen evicted, nächster Render re-detektiert mit v157 Geometry-Gate.

## Akzeptanz
- Log `v157_tight_mouth_box mouth_used=true aspect_in=1.53 aspect_out=0.55` für alle Pässe.
- Box-Area sinkt von 2-4% → 0.5-1.5% der Plate.
- Alle Sprecher synchron, keine Morphs.
