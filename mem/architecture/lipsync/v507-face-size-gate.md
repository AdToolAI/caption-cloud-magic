---
name: V507 Skalenfreies Gesichts-Größen-Gate
description: FA-4 Kandidaten-Sanity nutzt einen absoluten Pixel-Floor (kürzere Gesichtsseite >= 40 px) statt des prozentualen Flächen-Floors; area_too_small ist nur noch Warn-Telemetrie. Plus Kadrierungs-Pflicht für 3-4-Sprecher-Anker.
type: architecture
---

**VERBINDLICH.** Bewiesene Ursache für S02 `67b392b1` (`fa4_fail_closed:count_mismatch:anchor=4/plausible=1/detected=4`):
Rekognition fand alle 4 Gesichter, danach verwarf der prozentuale Flächen-Floor
(`minAreaRatio 0.003`) drei davon als `area_too_small`. Der Prozent-Floor skaliert
falsch mit der Auflösung: auf 1920x1080 verlangt er ~79x79 px Gesicht — eine
legitime Vier-Personen-Halbtotale liegt darunter.

Regeln:

- Gate ist die **kürzere Gesichtsseite in Plattenpixeln**: `PLATE_FACE_SANITY.minFaceShortSidePx = 40`.
  Reason bei Verstoß: `face_too_small_for_lipsync`.
- `minAreaRatio` (0.003) ist ausschließlich Warn-Telemetrie (`warnings: ["area_too_small"]`),
  niemals ein Gate. `maxAreaRatio`, Aspect, `out_of_plate`, `degenerate` bleiben unverändert.
- Kanonischer Owner bleibt `plateFaceSanity()` in `_shared/plate-face-candidates.ts`;
  `compose-dialog-segments` (v239-Repair-Gate) und der FA-4-Router nutzen genau diese Funktion.
- Verliert der Router Kandidaten **nur** wegen der Größe, meldet er
  `fa4_fail_closed:faces_too_small_for_lipsync:…` (nicht `count_mismatch`), klassifiziert als
  `contractual` (fail-closed, kein Legacy-Fallback), refundet und schreibt die Messwerte nach
  `composer_scenes.preview_audit.v507_face_size_gate`. `clip_error` trägt in diesem Fall den
  lokalisierten Kundensatz ("Gesichter zu klein für Lip-Sync — enger kadrieren").
- Ursachenseite: `neutralTwoShotPrompt` hängt für `n >= 3` eine Pflicht-Kadrierung an
  (Halbtotale/waist-up, Gesicht >= 1/8 Bildhöhe, keine Ganzkörper-Totale). Kamera bleibt
  laut Frozen-Invariant `LOCKED static camera`.
