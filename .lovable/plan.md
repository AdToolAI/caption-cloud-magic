## Diagnose

Der Screenshot zeigt jetzt eindeutig: Der Plan ist nicht inkonsistent, sondern wird **konsistent falsch** auf `5.1s` normalisiert:

- `SafePlanNotice` sagt: `5.1s · 3 Szenen`, Quelle: `Szenensumme`.
- Das bedeutet: `finalizePlanCanonical` sieht **keinen slider-authoritative Canonical-Timing-Marker**.
- Wenn dieser Marker fehlt, gewinnt weiterhin die alte Szenensumme `1.7 + 1.7 + 1.7 = 5.1s`.

Der eigentliche Fehler ist daher sehr wahrscheinlich nicht mehr nur `finalizePlanCanonical`, sondern der **Dauer-Wert kommt im Sheet nicht zuverlässig als 15 an** oder wird unterwegs wieder auf 5.1 zurückgeschrieben.

Der konkrete verdächtige Codepfad ist:

```text
BriefingTab Slider
  -> VideoComposerDashboard project.briefing.duration
  -> useStoryboardTransition applyCanonicalTimingToPlan
  -> ProductionPlanSheet currentBriefing.duration
  -> finalizePlanCanonical
```

Zusätzlich gibt es noch alte Stellen in `useStoryboardTransition`, die nach einer Normalisierung `onUpdateBriefing({ duration: normalized.timing.durationSec })` aufrufen. Wenn `normalized.timing` aus alten Short-Windows/Planwerten kommt, kann dadurch der Slider-State selbst wieder auf `5.1` gezogen werden. Genau das würde erklären, warum im Sheet keine Slider-Quelle mehr sichtbar ist.

## Plan

1. **Slider-Wert vor Analyse einfrieren**
   - Beim Start der Briefing-Analyse den aktuellen `briefing.duration` als `requestedDurationSec` in den Plan-Meta-Daten speichern.
   - Dieser Wert wird dann im Plan mitgeführt, auch wenn React-State oder spätere Fallback-/Late-Arrival-Flows sich verändern.

2. **Kein Rückschreiben aus Plan-Timing in den Slider mehr**
   - Alle Stellen entfernen/anpassen, die `onUpdateBriefing({ duration: normalized.timing.durationSec })` aus AI-/Fallback-/Late-Arrival-Planwerten machen.
   - Der Slider darf nur durch den Nutzer geändert werden, nicht durch erkannte Script-Windows oder Plan-Summen.

3. **ProductionPlanSheet strikt gegen den eingefrorenen Slider normalisieren**
   - `ProductionPlanSheet` nutzt zuerst `currentBriefing.duration`.
   - Falls dieser Wert durch alte State-Hydration falsch ist, nutzt es den im Plan gespeicherten `requestedDurationSec`.
   - Erst danach wird `applyCanonicalTimingToPlan`/`finalizePlanCanonical` ausgeführt.

4. **UI-Werte nur aus `safePlan` anzeigen**
   - Projekt-Gesamtdauer, Szenensumme, Szenenanzahl und Szenendauern bleiben konsequent aus `safePlan`.
   - Zusätzlich soll die Quelle dann sichtbar `Videodauer-Slider` sein, nicht `Szenensumme`.

5. **Regressionstest für den echten Screenshot-Fall**
   - Plan: 3 Szenen à `1.7s`, Projekt `5.1s`, altes Short-Window-Meta.
   - Briefing/Requested Slider: `15s`.
   - Erwartung: Anzeige/Finalplan `15s`, Szenen `[5,5,5]`, Quelle `briefing-slider`.
   - Extra-Test: Analyse darf `briefing.duration` nicht mehr von `15` auf `5.1` zurückschreiben.

## Ergebnis nach Umsetzung

Wenn der Nutzer den Slider auf `15s` stellt, kann kein alter Shot-Marker, keine Szenensumme und kein AI-/Fallback-Plan den Wert mehr auf `5.1s` zurücksetzen. Im Production Plan muss dann stehen:

```text
15s · 3 Szenen
Quelle: Videodauer-Slider
Gesamtdauer: 15s
Summe Szenen: 15s
Szenen: 5s / 5s / 5s
```