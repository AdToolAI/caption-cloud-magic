# Lip-Sync-Reparatur: tatsächliche Mundbewegung statt falschem „fertig“

## Belegter Befund

- Die untersuchte Szene `d7402a67…` wurde formal mit vier erfolgreichen Provider-Pässen abgeschlossen, visuell aber nicht korrekt.
- Alle vier Provider-Ausgaben sind quadratische 720×720-Preclips. Pass 2–4 enthalten nahezu keine Pixelbewegung; Pass 2 und Pass 3 zeigen außerdem mehr als eine Person. Die angebliche Einzelgesicht-Isolation funktioniert damit nicht zuverlässig.
- Der finale 1284×718-Clip ist dem Quellclip extrem ähnlich. Die Lippenbewegung aus den Pässen kommt im sichtbaren Ergebnis nicht belastbar an.
- Der aktuelle `DialogStitchVideo` ist **nicht** 1:1 die Version vom 27.07.: 84 Zeilen unterscheiden sich, insbesondere Crop-Skalierung, Maskenkern und bewegte Crop-Pfade. Auch `compose-dialog-segments` enthält noch eine Abweichung.
- Ein Status `done` beweist momentan nur, dass Dateien erzeugt und gemuxt wurden — nicht, dass im Zielmund Bewegung vorhanden ist.

## Umsetzung

1. **Juli-Bildpfad vollständig wiederherstellen**
   - `DialogStitchVideo` und `DialogTurnFaceCropVideo` exakt auf Commit `58060cffe` zurückführen.
   - Die verbliebene Abweichung in `compose-dialog-segments` nur dort auf Juli-Parität bringen, wo sie Preclip, Timing oder Dispatch beeinflusst; den notwendigen serverseitigen Audio-Hand-off nicht blind entfernen.
   - `render-sync-segments-audio-mux` gegen den Juli-Commit verifizieren und unverändert lassen, falls bereits identisch.

2. **Echte Einzelgesicht-Preclips erzwingen**
   - Vor dem Provider-Dispatch jeden gerenderten Preclip prüfen: genau ein Gesicht, Zielgesicht vollständig im Bild, Mund innerhalb des sicheren Innenbereichs.
   - Enthält ein Preclip null oder mehrere Gesichter, den Crop einmal deterministisch enger neu rendern; danach bei erneut falschem Ergebnis den Pass abbrechen und automatisch erstatten.
   - Keine mehrgesichtigen 720×720-Clips mehr als erfolgreichen Einzelsprecher-Input akzeptieren.

3. **Qualität vor `done` prüfen**
   - Für jeden Provider-Output die Mundregion über mehrere Frames mit dem Input vergleichen.
   - Nur wenn im Zielmund zeitliche Veränderung gegenüber dem Input nachweisbar ist, darf der Pass `done` werden.
   - Statische oder praktisch unveränderte Outputs als `provider_passthrough` behandeln, Szene verständlich fehlschlagen lassen und Credits idempotent erstatten.

4. **Finalen Stitch verifizieren**
   - Nach dem Mux dieselben Sprecher-Zeitfenster im finalen Vollbild prüfen.
   - Sicherstellen, dass der aktive 720×720-Pass exakt in seinen ursprünglichen Plate-Crop zurückprojiziert wird und der Mund nicht durch die Maske oder die Quellplatte verdeckt bleibt.
   - Ein technisch fertiger Render ohne nachweisbare finale Mundbewegung darf nicht als `ready` erscheinen.

5. **Kontrolllauf und Nachweis**
   - Frische 4-Sprecher-Szene durchlaufen lassen.
   - Für jeden Sprecher Input-Preclip, Provider-Output und finalen Zeitabschnitt als Framefolge vergleichen.
   - Erst freigeben, wenn alle vier Sprecher ausschließlich in ihren Dialogfenstern sichtbar den Mund bewegen; danach die verifizierte Baseline dokumentieren.

## Technische Leitplanken

- Keine neuen Identitäts-, State-Machine- oder Run-Guard-Umbauten.
- Keine Reaktivierung der nach dem 27.07. eingeführten bewegten Crop-Pfade.
- Qualitätsgate misst die Mundregion, nicht allgemeine Körper- oder Kamerabewegung.
- Fehlerpfade bleiben mit der bestehenden automatischen, idempotenten Rückerstattung verbunden.
