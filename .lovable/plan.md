# Plan v338 — Evidenzbasierter Preclip-Trust-Fix

## Bestätigte Ursache
Beim aktuellen Lauf `69d56a49-8f59-42ab-ab06-8868f0b42db1` wurden drei Sprecher erfolgreich an den Lip-Sync-Anbieter geschickt. Der vierte Preclip wurde ebenfalls korrekt gerendert, hatte:

- 720×720 Ausgabe
- 24,29 % Face-Share bei einem Mindestwert von 24 %
- keinen zweiten Gesichtsmittelpunkt im Crop
- einen gültigen 68-Frame-Bounding-Box-Track

Trotzdem wurde er blockiert, weil die ursprüngliche Gesichtbox nur 2,88 % der gesamten Plate-Breite einnahm und deshalb pauschal `box_too_small → geometry_suspicious → untrusted_multispeaker_without_probe` gesetzt wurde. Das ist ein Widerspruch: Die kleine Box beschreibt hier ein kleines, aber sauber isoliertes Gesicht; der daraus berechnete Crop erfüllt anschließend bereits alle relevanten Sicherheitsbedingungen.

## Umsetzung
1. **Geometrie-Risiken differenzieren**
   - `box_too_small` nicht länger pauschal mit einer unbrauchbaren finalen Preclip-Geometrie gleichsetzen.
   - Zwischen fehlender/ungültiger Box und einer kleinen, aber erfolgreich validierten Box unterscheiden.

2. **Trust aus der finalen Konstruktion ableiten**
   - Einen Preclip ohne JPEG-Probe nur dann freigeben, wenn Render erfolgreich, Face-Share ≥ 24 %, Crop gültig, kein Geschwistergesicht im Crop und Ambiguität sauber sind.
   - `no_bbox`, ungültige Maße, Geschwistergesicht, zu geringer Face-Share und echte Geometriefehler bleiben weiterhin fail-closed.

3. **Face-Gate konsistent machen**
   - Die Trust-Entscheidung und ihren exakten Grund unverändert bis `verifyFaceBeforeDispatch` transportieren.
   - `trusted_preclip_without_probe` für den belegten Fall erlauben; Full-Plate-Inputs bleiben blockiert.

4. **Regressionstests ergänzen**
   - Exakter Fehlerfall: 2,88 % Plate-Breite, 24,29 % finaler Face-Share, kein Sibling → vertrauenswürdig.
   - Gegenfälle: Share unter 24 %, Sibling im Crop, fehlende/ungültige Box, zweifelhafte Ambiguität → blockiert.
   - Sicherstellen, dass bestehende v336-Fail-Closed-Fälle unverändert bestehen.

5. **Deployment und Verifikation**
   - Betroffene gemeinsame Trust-/Geometrie-Module und `compose-dialog-segments` deployen.
   - Den fehlgeschlagenen Szenenpfad erneut ausführen und anhand der Logs prüfen, dass alle vier Passes das Face-Gate durchlaufen und anschließend v337s Motion-Probe vor dem finalen Mux greift.
   - Credits bleiben bei endgültigem Anbieter-/Motion-Probe-Fehler automatisch und idempotent geschützt.