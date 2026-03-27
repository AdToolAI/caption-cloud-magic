

## Fix: Letzte 2 Übergänge ~0.2s zu früh / "verschmelzen"

### Ursache

Die Transition-Fenster sind **zentriert** um die Szenengrenze: `[boundary - half, boundary + half]`. Wenn zwei aufeinanderfolgende Szenen kurz sind, **überlappen** sich die Fenster:

```text
Szene 1 endet bei 5.0s → Transition 1: [4.6, 5.4]
Szene 2 endet bei 6.0s → Transition 2: [5.6, 6.4]
                                          ↑ Gap nur 0.2s

Bei noch kürzeren Szenen oder längerer Duration → Überlappung!
```

Da beide Loops (`findActiveTransition` und `useTransitionRenderer`) mit `break` beim ersten Treffer aufhören, "gewinnt" immer die erste Transition — aber die zweite startet zu früh nach Ende der ersten, weil das Base-Video kaum Zeit hat, sich auf die neue Szene zu synchronisieren.

### Lösung: Transition-Fenster clampen, damit sie sich nie überlappen

**Beide Stellen** (Player + Renderer) müssen die gleiche Clamp-Logik verwenden:

1. **`findActiveTransition`** (Zeile 132-152): Vor dem Window-Check prüfen, ob das vorherige Transition-Fenster noch aktiv wäre — wenn ja, das aktuelle `tStart` auf `prevEnd` verschieben
2. **`useTransitionRenderer`** (Zeile 41-62): Gleiche Clamp-Logik anwenden

Konkret: Für jede Transition das effektive `tStart` als `max(boundary - half, prevBoundary + prevHalf)` berechnen. So wird die Transition verkürzt statt überlappt.

### Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — `findActiveTransition` mit Overlap-Clamping
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — gleiche Clamp-Logik im rAF-Loop

