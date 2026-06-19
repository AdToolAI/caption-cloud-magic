# v135 Pre-Crop Coord Snap — Implemented

Status: ✅ shipped.

## Fix

Pre-Snap-Block in `compose-dialog-segments/index.ts` direkt vor der v116 Expansion-Ladder:
AWS Rekognition läuft auf der vollen Plate, korrigiert ASD-Coords, Preclip-Crop landet auf dem Gesicht.

- Frame-Source: `faceMap.frame_url` (von plate-face-identity bereits extrahiert) → keine zusätzliche Extraktion.
- Nearest-Neighbour Match auf Multi-Face-Plates.
- Distance-Bands: ≤60px noop, 60-200px snap, >200px skip.
- Safe-Zone 5%-95%.
- Persistiert `coords_snap_origin`, `coord_snap_distance_px`, `coord_snap_skipped_reason` u.a.
- Try/catch: bei Fehler bleibt Verhalten wie vorher (Expansion-Ladder springt ein).

Doku: `mem/architecture/lipsync/v135-pre-crop-coord-snap.md`.
