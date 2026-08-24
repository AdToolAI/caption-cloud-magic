# V477 — Landmark Authority + Rücknahme der 0.88-Kompensation

Ein Gate, zwei zusammengehörige Änderungen: gemessene Mund-Landmarks werden autoritative
Quelle der Preclip-Geometrie, und die kompensatorische V471-Ratio 0.88 verschwindet.
**Der Camera Path bleibt in V477 unverändert** (Verhalten wie heute) — das ist V478.

## Bestätigte Ausgangslage (read-only verifiziert)

- `dialog_shots.plate_identity.mouths` für S01 = `[null, null, null, null]`, ebenso
  `faces[].mouth`. Genau daraus speist sich `speakerPlateMouths[]`
  (`compose-dialog-segments/index.ts` 1878–1924) → `v456DetectedMouth = null`
  (Zeile 5741) → `resolveMouthAnchorPoseAware` liefert `pose_estimate`.
- Der **Pass-Track** hat die echten Landmarks: `preclip_face_track.samples` enthält in
  allen 5 dispatchten Pässen 6/6 Samples mit `mouth` (gemessenes Verhältnis 0.734–0.781).
- Diese Landmarks entstehen aber **zu spät**: `trackAssignedFaceAcrossTurn` läuft im
  Callback `buildCameraPath` (Zeile 5789–5834), der erst *nach*
  `computeMouthCenteredCrop` (`pass-face-preclip.ts` 321) aufgerufen wird.
- `V471_FACE_MOUTH_Y_RATIO = 0.88` (`_shared/v471-mouth-roi.ts` 43) ist reine
  Kompensation; der Landmark-Pfad (Zeile 142) ist bereits korrekt implementiert und
  wird nur nie erreicht, weil `mouthSource` immer `pose_estimate` ist.

Kernursache in einem Satz: **Der Track misst den Mund korrekt, aber die Messung entsteht
nach der Geometrie und wird deshalb verworfen.**

## Änderung 1 — Track-Landmark wird Mund-Authority

Reihenfolge umstellen, ohne Zusatzkosten (derselbe eine Rekognition-Track-Lauf):

```text
heute:   Crop (pose_estimate)  →  Track (echte Mouths)  →  Camera Path
V477:    Track (echte Mouths)  →  Mouth-Authority  →  Crop  →  Camera Path (unverändert)
```

- `trackAssignedFaceAcrossTurn` aus dem `buildCameraPath`-Callback heraus vor den
  Preclip-Render hochziehen; die Samples werden einmal gemessen und anschließend an
  `buildCameraPath` durchgereicht, damit `buildDynamicCameraPath` exakt dieselben
  Eingaben wie heute bekommt (kein Verhaltenswechsel beim Pfad).
- Aus den Track-Samples den autoritativen Mundpunkt am Referenzframe ableiten
  (Median der gemessenen `mouth`-Punkte, robust gegen Ausreißer).
- Präferenzkette in `resolveMouthAnchorPoseAware` bleibt strukturell gleich, wird aber
  jetzt tatsächlich bedient:
  1. Track-Landmark → `source = "landmark"`
  2. Plate-Identity-Landmark (falls vorhanden) → `"landmark"`
  3. validierter Face-Ratio-Fallback `FACE_MOUTH_Y_RATIO = 0.78` → `"pose_estimate"`
- Bei Track-Fehlschlag/fehlenden Landmarks bleibt exakt das heutige Verhalten
  (Fallback-Ratio, statischer Crop). Kein neuer Fehlerpfad.
- Persistenz unverändert benannt: `preclip_geometry_mouth_source`,
  `preclip_mouth_offset_xy`, `preclip_crop` — nur mit korrekten Werten.

## Änderung 2 — 0.88 entfernen, eine Authority

- `V471_FACE_MOUTH_Y_RATIO` entfällt. `v471-mouth-roi.ts` importiert den einen
  Fallback-Wert `FACE_MOUTH_Y_RATIO = 0.78` aus `_shared/v456-roi-contract.ts`.
- Damit rekonstruiert die Verdict-Seite keine zweite Mundposition mehr: bei
  `mouthSource = "landmark"` gilt ausschließlich `preclip_mouth_offset_xy` aus der
  Preclip-Geometrie; die Ratio greift nur noch, wenn gar kein Landmark existiert.
- Kommentarblock in `v471-mouth-roi.ts` auf den V476-Befund umschreiben (0.88 war
  Kompensation für Defekt 1, nicht Geometrie).

## Änderung 3 — Konsumentenparität

- `sync-so-webhook` (Zeilen 823/839) liest bereits `preclip_mouth_offset_xy` und
  `preclip_geometry_mouth_source`; nachweisen, dass Watchdog und Re-Measure denselben
  Pfad benutzen (`evaluateMouthRoiContract` hat aktuell nur diesen einen Konsumenten)
  und keine eigene Mundableitung besitzen.

## Abnahme vor jedem S01-Rerender (Frozen-Replay, kein neuer Lauf)

Offline-Replay gegen die eingefrorenen S01- und Golden-Run-Artefakte:

1. Pässe mit Track-Landmarks liefern `source = "landmark"`, nicht `pose_estimate`.
2. Das gemessene Verhältnis 0.734–0.781 erscheint in der Preclip-Geometrie.
3. Matthew (P4): heutiger Vertikalfehler von 94 px (Ist 0.489 vs. ROI 0.608) verschwindet.
4. P1/P2 Verdict-ROI liegt über dem echten bearbeiteten Mundband statt 22–86 px daneben.
5. Ohne Landmarks greift der 0.78-Fallback unverändert.
6. Frozen-Kohorte: keine neuen False-Greens und keine neuen False-NOOPs
   (Re-Score gegen die V465-Bänder 2.00 / 2.65).
7. Camera-Path-Signaturen der Frozen-Pässe bleiben identisch — Beweis, dass V477 den
   Pfad nicht angefasst hat.

Ergebnis wird in `docs/v477-landmark-authority.md` dokumentiert.

## Nicht in V477

- Track → geglätteter Camera Path (Mund-Drift bis 54 px X / 50 px Y) → **V478**.
- Neuer S01-Canary → erst nach V478.

## Technische Dateien

- `supabase/functions/compose-dialog-segments/index.ts` — Track-Hoisting,
  Mouth-Authority, Durchreichen der Samples an `buildCameraPath`.
- `supabase/functions/_shared/pass-face-preclip.ts` — Annahme des vorgemessenen
  Mundpunkts / der Track-Samples.
- `supabase/functions/_shared/v456-roi-contract.ts` — Präferenzkette dokumentieren,
  `FACE_MOUTH_Y_RATIO` als einziger Fallback-Export.
- `supabase/functions/_shared/v471-mouth-roi.ts` — 0.88 entfernen.
- Tests: `v471-mouth-roi.test.ts`, `v456-roi-contract.test.ts` (0.88-Assertions
  ersetzen) plus neue Frozen-Fixture-Fälle für Landmark-Priorität.
