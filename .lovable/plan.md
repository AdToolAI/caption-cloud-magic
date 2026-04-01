

## Fix: Transition-Dauer-Slider funktioniert nicht richtig

### Problem

Der Slider geht aktuell von 0.1s bis 2.0s — aber der Resolver in `transitionResolver.ts` clampt alles unter 0.6s auf 0.6s (`MIN_DURATION = 0.6`). Zusätzlich resettet `useTransitionRenderer.ts` bei jeder Änderung die Transition-Phase, sodass man den Effekt einer Dauer-Änderung kaum sieht.

### Änderungen

**1. `src/utils/transitionResolver.ts`**
- `MIN_DURATION` von 0.6 auf 0.1 senken, damit der gesamte Slider-Bereich tatsächlich wirkt

**2. `src/components/directors-cut/ui/TransitionPicker.tsx`**
- Slider-Range beibehalten (0.1s–2.0s), aber `step` auf 2 erhöhen (= 0.2s Schritte) für spürbarere Unterschiede
- Labels anpassen: "0.1s" → "2.0s"

**3. `src/components/directors-cut/preview/useTransitionRenderer.ts`**
- Den Reset-Effect so umbauen, dass reine Dauer-Änderungen die laufende Transition NICHT abbrechen
- Nur bei Typ- oder Szenen-Änderungen zurücksetzen

