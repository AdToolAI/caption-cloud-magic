

## Fix: Transition-Timing-Offset für Übergänge 2 und 3

### Ursache

Die KI-Schnitterkennung erkennt die exakten Cut-Punkte nicht präzise genug. Egal wie fein das Frame-Sampling ist (0.1s), die KI identifiziert den visuellen Schnitt manchmal 2-4 Frames zu früh. Bei Übergang 1 trifft sie zufällig, bei 2 und 3 liegt sie ~0.4s daneben. Das ist ein **Daten-Problem**, kein Renderer-Problem.

### Lösung: Timing-Offset pro Transition

Statt weiter am Renderer oder an der Analyse-Präzision zu drehen, geben wir dem Nutzer eine einfache Kontrolle:

1. **`offsetSeconds` Feld zum TransitionAssignment hinzufügen** (default: 0)
   - Positiver Wert = Übergang später starten
   - Negativer Wert = Übergang früher starten
   - Bereich: -2.0 bis +2.0 Sekunden, Schrittweite 0.1s

2. **Offset-Slider im Transition-Editor** (TransitionPicker)
   - Kleiner Slider unter dem Typ-Selector
   - Label: "Timing anpassen" mit Anzeige des Werts in Sekunden

3. **Offset in allen Transition-Berechnungen anwenden**
   - `boundary = (scene.original_end_time ?? scene.end_time) + (transition.offsetSeconds ?? 0)`
   - In: `findActiveTransition`, `useTransitionRenderer`, `NativeTransitionOverlay`, `NativeTransitionLayer`

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/types/directors-cut.ts` | `offsetSeconds?: number` zu `TransitionAssignment` |
| `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` | Offset in `findActiveTransition` boundary |
| `src/components/directors-cut/preview/useTransitionRenderer.ts` | Offset in boundary-Berechnung |
| `src/components/directors-cut/preview/NativeTransitionOverlay.tsx` | Offset in boundary-Berechnung |
| `src/components/directors-cut/preview/NativeTransitionLayer.tsx` | Offset in boundary-Berechnung |
| `src/components/directors-cut/ui/TransitionPicker.tsx` | Offset-Slider UI |

### Technische Details

```typescript
// TransitionAssignment erweitern
offsetSeconds?: number; // -2.0 bis +2.0, default 0

// Boundary-Berechnung überall:
const offset = transition.offsetSeconds ?? 0;
const boundary = (scene.original_end_time ?? scene.end_time) + offset;
```

### Warum das der richtige Ansatz ist

- KI-Schnitterkennung wird nie 100% framegenau sein
- Der Nutzer sieht sofort im Preview ob der Übergang passt
- Einfacher +/- Slider ist intuitiver als Anchor-Dragging
- Kein Risiko für neue Bugs im Playback-Loop
- Alle bisherigen Fixes (kein Loop, kein Stottern, Video-led) bleiben unangetastet

