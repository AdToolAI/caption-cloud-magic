## Diagnose (belegt, nicht vermutet)

Szene `6bf4e815…`, Pass 1 (Samuel):

- Korrekte Clip-Gesichtsbox war **[154,113,561,624]** (≈ 40 %).
- Turn nur 1,18 s → Tracking lieferte `anchor_fallback`.
- Die bereits gepaddete Box wurde **erneut** aufgeweitet: **[52,0,663,720]** = **84,86 %**.
- Die drei erfolgreichen Sprecher lagen bei **38–41 %** und wurden alle korrekt animiert.
- Sync.so bekam damit fast das ganze Bild statt einer Gesichtsregion und gab den Preclip unverändert zurück. Das v371-Verdikt hat diesen echten Passthrough korrekt gemeldet.

Zwei strukturelle Ursachen, nicht eine:

1. **Padding hat keine eindeutige Zuständigkeit.** Getrackte Boxen werden in `face-track.ts` gepaddet; die Anchor-Box wird in `compose-dialog-segments` gepaddet — und im Fallback zusätzlich ein zweites Mal.
2. **Das Sanity-Gate deckt den Fall nicht ab.** Im Preclip-Modus ist die Obergrenze 0.98, eine Fast-Vollbildbox gilt dort als plausibel.

Der `CreateCollection AccessDeniedException` ist ein separater Warnpfad und war für diesen Pass nicht ursächlich: Preclip, Audio und Clip-Koordinaten wurden korrekt erzeugt.

## Plan v372 — Eine Padding-Zuständigkeit statt Symptomfix

### 1. Padding genau einmal, an einer Stelle
- `face-track.ts` liefert **rohe** Gesichtsboxen zurück (Keyframes und Fallback-Anchor gleichermaßen), ohne Kontextaufschlag.
- Der Kontextaufschlag wird ausschließlich beim Bau der Dispatch-Box in `compose-dialog-segments` angewendet — für getrackte und ungetrackte Boxen identisch.
- Ergebnis: Tracking-Erfolg oder -Ausfall ändert die Boxgeometrie nicht mehr systematisch. Genau das war der Unterschied zwischen Samuel und den drei funktionierenden Sprechern.

### 2. Obergrenze an der Empirie ausrichten, ohne neue Abbruch-Lotterie
- Für den Preclip-Pfad die Fläche der Dispatch-Box auf einen an den erfolgreichen Läufen gemessenen Bereich **begrenzen statt abzubrechen**: Boxen über der Grenze werden auf das Gesichtszentrum zurückgeschnitten, nicht verworfen.
- Der bestehende Hard-Fail bleibt nur für tatsächlich unmögliche Geometrie (leere oder außerhalb liegende Box).
- Begründung: v344–v355 haben gezeigt, dass zusätzliche harte Schwellen legitime Szenen blockieren. Ein Clamp korrigiert, ohne Credits zu vernichten.

### 3. Forensik
- Pro Pass festhalten: Tracking-Quelle, Box vor und nach Padding, finale Flächenangabe und ob geclampt wurde.
- Damit ist beim nächsten Fall in einer Zeile sichtbar, ob Geometrie oder Provider die Ursache war.

### Verifikation
- Regressionstests: Fallback-Anchor und getrackte Box ergeben nach dem Dispatch-Bau dieselbe Flächenordnung (≈ 40 %, nicht 85 %); die realen Samuel-Werte dürfen nicht mehr auf `[52,0,663,720]` wachsen.
- `compose-dialog-segments` deployen, den betroffenen Pass erneut fahren und in den Logs prüfen: Box ≈ `[154,113,561,624]`, Fläche ≈ 40 %, kein Passthrough-Verdikt.
- Anschließend ein vollständiger 4-Sprecher-Lauf derselben Szene.

### Bewusst nicht angefasst
v371-Verdiktlogik, Preclip-Rendering, Mux und Dispatch-Reihenfolge. Die Änderung betrifft ausschließlich die Erzeugung der Ziel-Bounding-Box.

### Offener, getrennt zu behandelnder Punkt
Der Rekognition-`AccessDeniedException` sollte separat geprüft werden. Er hat diesen Fehlschlag nicht verursacht, kostet aber bei jedem Lauf die Identitäts-Absicherung über die Face-Collection.