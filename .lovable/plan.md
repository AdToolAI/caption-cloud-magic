

## Fix: Übergänge 2 und 3 um ~0.5s zu früh

### Ursache

Das Problem liegt im **asymmetrischen Transition-Timing**: Aktuell starten Übergänge **30% VOR** der Szenengrenze (Lead-in = 0.36s) und enden 70% danach. Das bedeutet, der Incoming-Frame erscheint bereits 0.36s bevor die Szene eigentlich zu Ende ist. Dazu kommt: Während Transitions läuft das Video frei weiter ohne Seeks. Browser-Decoder haben minimale Timing-Ungenauigkeiten, die sich über mehrere Übergänge akkumulieren (~0.1-0.15s pro Transition). Bei Transition 2 und 3 summiert sich das auf ~0.5s.

### Lösung

**Transition-Fenster verschieben: von 30/70 auf 5/95 Split**

Statt den Übergang 0.36s vor der Grenze zu starten, beginnt er nur noch 0.06s vorher — praktisch exakt an der Szenengrenze. Der visuelle Effekt (Fade/Slide) startet erst, wenn die aktuelle Szene tatsächlich fertig ist.

Änderung in **3 Stellen** (alle verwenden dasselbe asymmetrische Timing):

1. **`findActiveTransition`** im PreviewPlayer (Zeile ~140)
2. **`useTransitionRenderer.ts`** (Zeile ~51)
3. **`NativeTransitionOverlay.tsx`** (falls noch verwendet)

```typescript
// Vorher:
const leadIn = tDuration * 0.3;   // 0.36s vor der Grenze
const leadOut = tDuration * 0.7;  // 0.84s nach der Grenze

// Nachher:
const leadIn = tDuration * 0.05;  // 0.06s vor der Grenze (fast exakt am Cut)
const leadOut = tDuration * 0.95; // 1.14s nach der Grenze
```

### Warum das funktioniert
- Transition 1 bleibt gut (war eh schon OK, wird minimal verschoben)
- Transitions 2 und 3 starten ~0.3s später → kompensiert die ~0.5s Drift
- Die Transition-Dauer bleibt gleich (1.2s), nur das Fenster verschiebt sich
- Kein neuer Code, nur 2 Konstanten ändern

### Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — `findActiveTransition`: leadIn/leadOut Split
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — gleicher Split
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx` — gleicher Split (Konsistenz)

