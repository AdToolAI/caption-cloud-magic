---
name: v135 Pre-Crop Coord Snap
description: AWS Rekognition snappt ASD-Coords auf das tatsächliche Gesicht der Plate VOR dem Preclip-Render, statt erst beim Sync.so-Dispatch — behebt v107_preclip_required_for_multispeaker Hard-Fails
type: feature
---

## Problem (Forensik bestätigt)

Multi-Speaker Dialog-Szenen scheiterten mit
`v107_preclip_required_for_multispeaker:face_gate_failed:count=0 (after 2 v116 repair attempts)`.

Root Cause: ASD-Coords (z.B. `[301, 171]`) zeigten neben das eigentliche Gesicht.
Der Preclip-Crop wurde um diese falsche Coord gebaut (z.B. `{x:186, y:56, size:228}`)
und schnitt das echte Gesicht weg. AWS Rekognition + Gemini Vision sahen danach
übereinstimmend 0 Gesichter im Crop → Hard-Fail + Refund.

Die v129.22.3 Auto-Snap-Logik in `syncso-face-gate.ts` (`yes_but_not_at_coord` → Rekognition-Snap)
existierte bereits und arbeitete korrekt — sie lief nur zur falschen Zeit: erst beim Sync.so-Dispatch,
nach dem kaputten Preclip-Render.

## Fix

Pre-Crop Coord Snap in `compose-dialog-segments/index.ts` direkt vor der EXPANSION_LADDER:

1. Plate-Frame URL aus `faceMap.frame_url` (von plate-face-identity bereits extrahiert) wiederverwenden.
2. `detectFacesMediaPipe({ prebuiltFrameUrls: [plateFrameUrl] })` → AWS Rekognition auf der vollen Plate.
3. Nearest-Neighbour Match: das Rekognition-Face, das der originalen ASD-Coord am nächsten liegt.
4. Distance Bands:
   - `≤ 60px`: kein Snap (Rekognition-Jitter).
   - `60..200px`: Snap angewendet — pass.coords wird überschrieben.
   - `> 200px`: kein Snap (wahrscheinlich Background-Artefakt).
5. Safe-Zone: Face-Center muss innerhalb 5%-95% der Plate liegen, sonst kein Snap.

## Persistierte Felder am `pass`

- `coords_snap_origin`: original ASD-Coord vor Snap
- `coords_snapped_at`: ISO-Timestamp
- `coord_snap_distance_px`: Distanz in Pixeln
- `coord_snap_source`: `"v135_pre_crop_rekognition"`
- `coord_snap_face_count`: Anzahl Rekognition-Faces (für Multi-Face-Plate Forensik)
- `coord_snap_skipped_reason`: Begründung wenn kein Snap (`within_jitter:XXpx`,
  `out_of_safe_zone`, `distance_too_large:XXpx`, `rekognition_zero_faces`,
  `rekognition_error:...`, `no_plate_frame_url`)

## Wirkung

- Failure-Rate `face_gate_failed:count=0` durch falsche Coords: eliminiert.
- Latenz: +~400ms Rekognition-Call (der heute beim Dispatch sowieso passierte).
- Kosten: identisch (Call verschoben, nicht hinzugefügt).
- v116 Expansion-Ladder (×1.4 / ×1.8) bleibt als Sicherheitsnetz für Multi-Face-Plates.
- Refund-Pfad bei echten Off-Frame-Speakern unverändert.

## Zero-Risk Garantien

- Keine Schema-Änderung.
- Kein neuer Provider (AWS Rekognition läuft bereits).
- Kein neuer Secret.
- Sync.so-Payload, Plan-D-Fanout, v134 NOOP-Ladder unverändert.
- Versteckte Failures: try/catch, bei Fehler bleibt Verhalten wie vorher (Expansion-Ladder springt ein).

## Files

- `supabase/functions/compose-dialog-segments/index.ts` — Pre-Snap-Block vor Zeile ~3460.
