# Plan v345 — Lip-Sync-Ausfall ohne weitere Geometrie-Experimente beheben

## Bestätigte Ursache

Der neue serverseitige Bewegungsprüfer sucht nach `REPLICATE_API_TOKEN`, im Backend ist jedoch `REPLICATE_API_KEY` konfiguriert. Deshalb endeten beim betroffenen Lauf alle vier Sprecher-Pässe mit `motion_verdict=unknown` und `motion_probe_unavailable:no_replicate_token`.

Der finale Mux blockiert aktuell nur nachgewiesen statische Ausgaben. Vier unbekannte Ergebnisse wurden dadurch trotz fehlendem Bewegungsnachweis als fertige Szene mit Voiceover ausgeliefert.

Die v169-Kerninvarianten — parallele unabhängige Sprecher-Pässe, eigener Preclip pro Sprecher und keine Verkettung von Provider-Ausgaben — bleiben unangetastet.

## Umsetzung

1. **Secret-Namensfehler korrigieren**
   - Der Bewegungsprüfer verwendet primär `REPLICATE_API_KEY`.
   - `REPLICATE_API_TOKEN` bleibt nur als abwärtskompatibler Alias erhalten.
   - Fehlermeldung und Telemetrie nennen künftig beide akzeptierten Namen korrekt.

2. **Fail-open-Lücke im Webhook schließen**
   - Ein Provider-Pass wird nur als visuell bestätigt behandelt, wenn der Server `moved` misst.
   - `static` nutzt weiterhin die bestehende NOOP-Wiederholungsleiter.
   - `unknown` aufgrund eines technischen Messfehlers wird nicht mehr still als erfolgreicher visueller Pass freigegeben; der Pass erhält einen klaren, wiederholbaren Prüfstatus statt als fertig durchzulaufen.

3. **Finalen Mux absichern**
   - Multi-Speaker-Szenen werden nur gemuxt, wenn jeder aktive Sprecher einen belastbaren Bewegungsnachweis besitzt.
   - `static` bleibt ein harter Block.
   - `unknown` blockiert den Mux mit einer verständlichen internen Ursache und löst den vorhandenen Retry-/Refund-Pfad aus, statt ein Voiceover-only-Video auszuliefern.
   - Bereits vorhandene, ausdrücklich erzwungene Diagnose-Remuxes bleiben möglich.

4. **Gezielte Regressionstests**
   - Testfälle für `REPLICATE_API_KEY`, Alias-Fallback, fehlende Secrets sowie `moved/static/unknown` ergänzen.
   - Mux-Gate mit 1-, 2- und 4-Sprecher-Pässen prüfen.
   - Sicherstellen, dass statische Provider-Ausgaben erneut versucht und niemals als fertiges Lip-Sync präsentiert werden.

5. **Deployment und Live-Verifikation**
   - Nur Bewegungsprüfer, Sync-Webhook und finalen Audio-Mux deployen.
   - Einen kontrollierten Mehrsprecher-Lauf ausführen und pro Sprecher `motion_verdict=moved`, individuelle Preclip-URL und individuellen Provider-Output verifizieren.
   - Erst danach die Szene als erfolgreich melden; andernfalls automatischer sauberer Fehler mit Credit-Rückerstattung.

## Bewusst nicht enthalten

- Keine weiteren Änderungen an Crop-Größen, Face-Share-Schwellen, Masken oder Charakter-Prompts.
- Kein erneuter Umbau der v169-Parallelarchitektur.
- Kein weiteres blindes Geometrie-Patching.