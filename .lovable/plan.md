

## Fix: Transition-Timing zentrieren

### Problem

In `transitionResolver.ts` (Zeile 91-92) ist die Aufteilung des Übergangsfensters stark asymmetrisch:

```text
leadIn  = duration * 0.05   (nur 5% VOR der Szenengrenze)
leadOut = duration * 0.95   (95% NACH der Szenengrenze)
```

Bei einer 1.2s-Transition bedeutet das: Der Übergang beginnt 0.06s vor dem Schnitt und läuft 1.14s danach. Das heißt, die eingehende Szene wird fast sofort sichtbar — der visuelle Eindruck ist "zu früh", weil der Effekt praktisch am Schnittpunkt beginnt statt sich um ihn herum aufzubauen.

### Lösung

Die Aufteilung auf **50/50** ändern, sodass der Übergang gleichmäßig um die Szenengrenze zentriert ist:

```text
leadIn  = duration * 0.5    (50% VOR der Grenze)
leadOut = duration * 0.5    (50% NACH der Grenze)
```

Bei 1.2s: 0.6s vor dem Schnitt → 0.6s nach dem Schnitt. Der Effekt baut sich natürlich auf und klingt symmetrisch ab.

### Betroffene Datei

- `src/utils/transitionResolver.ts` — Zeile 91-92: `leadIn`/`leadOut` Berechnung ändern

### Ergebnis

Übergänge sind visuell um den eigentlichen Schnittpunkt zentriert statt fast komplett danach zu liegen.

