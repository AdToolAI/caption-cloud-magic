## Diagnose (aus Forensik-Panel der fehlgeschlagenen Szene bestätigt)

- `MEDIAPIPE_FACES: 1` + `VERDICT: yes_but_not_at_coord` → AWS Rekognition sieht 1 Gesicht auf der Plate, aber **nicht** an Coord `[301, 171]` der ASD.
- `preclip_crop = {x:186, y:56, size:228}` ist um `[301,171]` zentriert → das echte Gesicht liegt außerhalb dieses 228×228-Crops.
- Im Crop-Video sehen Rekognition **und** Gemini übereinstimmend 0 Gesichter → Face-Gate Hard-Fail → `v107_preclip_required_for_multispeaker`.

**Die Auto-Snap-Logik (v129.22.3) existiert bereits in `_shared/syncso-face-gate.ts` und arbeitet korrekt — sie läuft nur zum falschen Zeitpunkt.** Sie greift erst beim Sync.so-Dispatch, nach dem Preclip-Render. Wir snappen also nachdem das Gesicht bereits weggeschnitten wurde.

## Plan v135 — Pre-Crop Coord Snap (Pipeline-Reihenfolge fixen)

### Kernfix: Snap VOR Preclip-Render

In `compose-dialog-segments/index.ts` direkt vor dem `renderPassFacePreclip`-Call (Zeile ~3478):

1. **Rekognition-Probe auf der vollen Plate** mit `detectFacesMediaPipe({ videoUrl: sourceClipUrl, plateWidth, plateHeight, frameTimestamps: [midSec] })` — exakt der Aufruf, der heute schon im Snap-Path läuft, nur früher.
2. Wenn Rekognition genau 1 Gesicht innerhalb der Safe-Zone (5%-95%) findet:
   - **Distanz zur ASD-Coord berechnen**. Wenn `dist > 60px` (Schwellwert): Coord auf Rekognition-Center überschreiben und in `pass.coords_snap_origin` + `pass.coords_snapped_at` persistieren (Felder existieren bereits, Zeile 419-420).
   - Wenn `dist ≤ 60px`: Coord lassen wie sie ist (Rekognition kann selbst ±20px wackeln, kein Pingpong).
3. Wenn Rekognition mehrere oder keine Gesichter findet: **Heutigen Pfad unverändert lassen** (Expansion-Ladder ×1.4 / ×1.8 läuft weiter als Sicherheitsnetz für Multi-Face-Plates).
4. Preclip-Crop wird mit den **korrigierten** Coords berechnet → Gesicht ist garantiert im Crop → Face-Gate passiert beim ersten Versuch.

### Wirkung

- Heutige Failure-Rate bei „Coords daneben" (~vermutlich 80% der `face_gate_failed:count=0` Cases): **eliminiert**.
- Worst-Case Latenz pro Pass: +~400ms (1 Rekognition-Call, der heute beim Dispatch sowieso passiert wäre).
- Kosten: Identisch zu heute — wir verschieben den Rekognition-Call, addieren keinen neuen.
- Sync.so-Pipeline, Plan-D-Fanout, NOOP-Ladder (v134): unverändert.

### Edge Cases

- **Sprecher wirklich verdeckt / off-frame**: Rekognition findet 0 Gesichter → heutiger Expansion-Ladder läuft → wenn auch der scheitert: heutiger Refund-Pfad mit klarem Error. Keine Regression.
- **Multi-Speaker-Plate, Rekognition findet 2+ Gesichter**: Nearest-Neighbour Match — wir snappen auf das Rekognition-Face das der ASD-Coord am nächsten ist, statt blind abzubrechen (das verbessert den heutigen `multiple_faces`-Abbruch zusätzlich).
- **Snap-Distanz > 200px**: Verdacht auf Background-Artefakt → Snap ablehnen, original Coords benutzen, mit `pass.coord_snap_skipped_reason = "distance_too_large"` für Forensik.

### Forensik-Bild als Bonus (Stage 2, optional)

Wenn du willst, hängen wir an die Forensik-Sheet noch ein gerendertes **annotiertes Frame** (Rekognition-Boxes grün, ASD-Coord rot, Crop-Rechteck gelb) an. Dann siehst du im Modal direkt warum gesnappt wurde / warum nicht. Reines UI, keine Pipeline-Änderung. Sag mir ob ich das in v135 mit reinpacke oder als v136 nachschiebe.

### Technische Details

**Files to edit:**
- `supabase/functions/compose-dialog-segments/index.ts` — neuer Pre-Snap-Block vor Zeile 3478, ~60 Zeilen.
- `supabase/functions/_shared/syncso-face-gate.ts` — Snap-Distance-Schwellwert + `nearest-neighbour` für Multi-Face leicht erweitern (~15 Zeilen), bleibt rückwärtskompatibel.

**Files to create:**
- `mem/architecture/lipsync/v135-pre-crop-coord-snap.md`.

**Files to update (Memory):**
- `mem/index.md` — Eintrag für v135.

**Kein Schema-Change. Kein neuer Secret. Kein neuer API-Provider. Rekognition ist bereits in Produktion.**

### Out of Scope

- Provider-Wechsel (Sync.so bleibt).
- Plate-Auto-Retry bei kaputter Hailuo-Komposition — separater Plan, falls Rekognition wirklich oft 0 Gesichter sieht.
- Migration auf InsightFace — Rekognition + MediaPipe + Gemini-Fallback sind State-of-the-Art genug.
