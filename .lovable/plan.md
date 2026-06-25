## Plan: Wiederkehrenden Lip-Sync-Fehler sauber beheben

### Befund
- Der Fehler kommt diesmal nicht aus Sync.so selbst und auch nicht aus der Audio-/Voice-Auswahl.
- In den Logs zur Szene `6d3fd7fb...` wurde ein Gesicht korrekt erkannt: `faces=1`, `mouth=1/1`.
- Danach bricht aber unsere eigene Vorprüfung ab: `v157_geometry_tighten_failed ... HARD_FAIL`.
- Ursache: Die neue Sicherheitsregel für „zu große Face-Boxen“ ist bei Single-Speaker-Closeups zu streng. Sie war gegen Mehrsprecher-/Torso-Fehlmasken gedacht, blockiert jetzt aber gültige Nahaufnahmen.

### Umsetzung
1. **Face-Geometry-Gate entschärfen, aber nur gezielt**
   - In `supabase/functions/_shared/plate-face-detect.ts` wird die v157-Regel angepasst.
   - Für Single-Speaker-Szenen mit genau einem erkannten Gesicht und vorhandenem Mund-Landmark darf eine größere Face-Box akzeptiert bzw. enger zugeschnitten werden.
   - Für Multi-Speaker bleibt die harte Sicherheitslogik bestehen, damit Sprecher nicht vertauscht oder falsch gemorpht werden.

2. **Box-Tightening robuster machen**
   - Wenn ein Mund-Landmark vorhanden ist, wird die neue Box stärker um den Mund/Face-Bereich kalibriert.
   - Die `tightHRatio > 0.25` Hard-Fail-Grenze wird nicht mehr blind auf gültige Single-Speaker-Closeups angewendet.
   - Ergebnis: klare Nahaufnahmen wie im Screenshot laufen weiter, problematische Mehrsprecher-Kompositionen werden weiterhin blockiert.

3. **Fehlermeldung präziser machen**
   - Falls die Vorprüfung wirklich blockiert, soll die UI/DB nicht mehr pauschal sagen „kein eindeutiges Gesicht“, wenn tatsächlich „Face-Box zu groß/Geometrie-Regel“ der Grund war.
   - Dadurch ist künftig sofort sichtbar, ob der Clip neu gerendert werden muss oder ob nur die interne Vorprüfung zu streng war.

4. **Bestehende Szene reparierbar machen**
   - Die Szene bleibt nicht dauerhaft durch gecachte/alte Fehldaten blockiert.
   - Beim nächsten „Lip-Sync neu rendern“ soll die aktualisierte Detection greifen und die vorhandene Szene nicht unnötig neu als Video-Plate erzeugt werden müssen.

5. **Deployment & Validierung**
   - Betroffene Backend-Funktion deployen.
   - Logs prüfen, ob die Szene danach nicht mehr bei `v157_geometry_tighten_failed` abbricht.
   - Die eigentliche Sync.so v169/v166 Pipeline bleibt unangetastet: keine Änderung am Dispatch-Modell, kein Wechsel von `sync-3`, keine Änderung an Audio-Segmenten oder Bounding-Box-URL-Strategie.

### Nicht enthalten
- Kein Umbau der Lip-Sync-Pipeline.
- Kein Provider-Wechsel.
- Kein erneutes Ändern der Briefing-/Storyboard-Logik.