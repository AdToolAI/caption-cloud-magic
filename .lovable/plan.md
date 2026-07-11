## Diagnose

Der Fehler ist kein Anzeigeproblem mehr, sondern ein Timing-Prioritätsfehler:

- Der Slider-Wert wird zwar auf `15s` in `canonical_timing.durationSec` geschrieben.
- Gleichzeitig bleiben aber alte `windows` / Shot-Marker aus dem KI-Plan erhalten, z.B. 3 Shots à ca. `1.7s`.
- `alignPlanScenesToCanonicalTiming` sieht diese Windows und setzt die Szenen wieder auf `1.7 + 1.7 + 1.7 = 5.1s`.
- Danach sieht `finalizePlanCanonical`: Projektdauer 15s, Szenensumme 5.1s, alte Windows widersprechen 15s, also gewinnt wieder die Szenensumme.

Kurz: Der Slider gewinnt aktuell nur auf Projektebene, aber die alten Shot-Windows gewinnen noch auf Szenenebene.

## Plan

1. **Slider-Override wirklich hart machen**
   - In `applyCanonicalTimingToPlan` beim Slider-Override nicht nur `durationSec` ersetzen.
   - Zusätzlich alte `windows` entfernen oder ignorieren, damit sie nicht wieder 5.1s erzwingen.
   - Szenen werden dann proportional aus dem Slider berechnet: bei 15s / 3 Szenen = 5s pro Szene.

2. **Timing-Meta eindeutig markieren**
   - Den Plan intern mit `slider_authoritative: true` / ähnlichem Debug-Marker markieren.
   - Dadurch ist später eindeutig sichtbar: Diese Dauer kommt aus dem Videodauer-Slider, nicht aus Skript-Shots.

3. **Finalizer absichern**
   - `finalizePlanCanonical` soll slider-authoritative Timing immer als validiert behandeln.
   - Falls trotzdem eine alte Szenensumme ankommt, wird sie auf den Slider zurückverteilt statt wieder 5.1s gewinnen zu lassen.

4. **UI-Klarheit im Production Plan**
   - Die Anzeige bleibt aus `safePlan` abgeleitet.
   - Optional den Hinweis von „Quelle: Briefing/Skript“ auf „Quelle: Videodauer-Slider“ ändern, damit der Kunde versteht, warum 15s gewinnt.

5. **Regressionstest ergänzen**
   - Testfall: Plan mit 3 Szenen und alten Windows/Szenendauern von 5.1s, Briefing-Slider 15s.
   - Erwartung: `project.totalDurationSec = 15`, Szenensumme = `15`, einzelne Szenen etwa `5s`.

## Ergebnis

Nach dem Fix kann ein alter Shot-/Script-Timing-Wert wie 5.1s den Slider nicht mehr überschreiben. Wenn der Slider auf 15s steht, zeigt der Production Plan auch 15s Gesamtdauer und 15s Szenensumme.