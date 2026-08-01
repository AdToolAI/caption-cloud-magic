# v358 — Preclip-Dimensionsvertrag reparieren

## Bestätigter Fehler

Das neue Face-Tracking funktioniert: Kailees Spur bewegt sich über **34 px** und wird als `tracked` geloggt. Der Bruch passiert danach:

- Der Preclip wird intern als **720 × 720** mit Crop `{x:1185,y:145,size:316}` geführt.
- Die an Sync.so gelieferte Bounding Box liegt deshalb im 720er Clip-Raum: `[139,0,581,508]`.
- Die tatsächlich von Sync.so gelesene Videodatei hat laut Provider-Fingerprint aber **1928 × 1076**.
- Damit zeigen die Bounding-Box-Koordinaten in den falschen Bildraum. Sync.so verfolgt nicht Kailees Mund und liefert das Video unverändert zurück (`outVsIn=1.1279` → Passthrough).

Die Sprechergröße ist hier **nicht** die Ursache: Kailee belegt im vorgesehenen Preclip rund **34,5 %** der Fläche. Auch Audio und Turn-Zeitfenster sind plausibel. Der aktuelle Remotion-Quellcode definiert bereits dynamische quadratische Metadaten; der laufende Renderpfad liefert jedoch weiterhin das falsche Seitenverhältnis. Das spricht für eine nicht wirksame bzw. veraltete Render-Bundle-Komposition oder eine fehlende Runtime-Dimensionsprüfung.

## Umsetzung

1. **Quadratischen Preclip serverseitig erzwingen**
   - `DialogTurnFaceCropVideo` weiterhin dynamisch über `outputSize` konfigurieren.
   - Beim Lambda-Aufruf zusätzlich die von Remotion tatsächlich verwendeten Force-Dimensionen auf `720 × 720` setzen, damit ein älteres Composition-Metadata-Fallback keinen 16:9-Clip mehr erzeugen kann.
   - Render-Bundle neu bereitstellen, sodass die aktuelle `calculateMetadata`-Logik produktiv aktiv ist.

2. **Provider-Input vor Sync.so hart validieren**
   - Nach jedem Preclip-Render die reale Datei mit dem vorhandenen Media-Probe prüfen.
   - Nur dispatchen, wenn Breite/Höhe dem erwarteten quadratischen Clip-Raum entsprechen und Framezahl/FPS zum ASD-JSON passen.
   - Bei Abweichung den Preclip einmal ohne Cache neu rendern; bleibt sie bestehen, sauber abbrechen und automatisch erstatten — niemals wieder falsche Koordinaten an Sync.so senden.

3. **BBox aus den realen Videodimensionen ableiten**
   - `trackW`, `trackH`, Flächenprüfung und JSON-Erzeugung an die gemessenen Preclip-Dimensionen koppeln statt nur an `preclip_crop.outputSize`.
   - Ein Raum-Mismatch (`expected 720×720`, tatsächlich z. B. `1928×1076`) wird als eigener Fehler `preclip_dimension_mismatch` protokolliert.

4. **Cache gegen veraltete Render-Artefakte absichern**
   - Den Preclip-Reuse-Key um Ausgabeformat, Breite, Höhe und eine Pipeline-Version erweitern.
   - Alte 16:9-Artefakte dürfen nicht als gültige quadratische Preclips wiederverwendet werden.

5. **Parallelstatus atomar halten**
   - Pass-Updates nur slotweise/atomar speichern, damit ein später oder erneut laufender Fan-out keine bereits fertigen Sprecher auf `pending` zurücksetzt.
   - Terminalfehler eines Passes dürfen die Nachbar-Pässe nicht überschreiben.

6. **Gezielte Verifikation**
   - Tests für Dimension-Mismatch, Cache-Ablehnung, 720er BBox-Transformation und parallele Pass-Updates ergänzen.
   - Einen neuen Vier-Sprecher-Testlauf prüfen: jeder Provider-Input muss quadratisch sein, die BBox muss im selben Raum liegen, alle vier Passes müssen einen echten Bewegungswert oberhalb der Passthrough-Schwelle liefern.

## Erfolgskriterium

```text
Master-Plate → echter 720×720 Single-Face-Preclip
             → Tracking + BBox ebenfalls in 720×720
             → Sync.so Output verändert den Mund
             → vier atomar abgeschlossene Passes
             → erst dann Mux
```
