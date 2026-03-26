

## Fix: Ruckeln an Szenenübergängen + unsichtbare Transitions (Step 3+)

### Bestätigte Ursachen

Ich habe den gesamten Code-Pfad und die offizielle Remotion-Dokumentation geprüft.

**1. Ruckeln an Szenenübergängen — fehlende `premountFor`**

Die Remotion-Docs sagen explizit: "For seamless transitions, use the `premountFor` prop for `<Sequence>`'s." Das Projekt nutzt Remotion v4.0.424, wo `premountFor` **nicht** automatisch aktiv ist (erst ab v5.0). Aktuell wird jede Szene erst gemountet wenn sie sichtbar wird — der Video-Decoder startet also erst im Moment des Schnitts, was schwarze Frames / Ruckler erzeugt.

**2. Transitions unsichtbar — Underlay im Preview deaktiviert**

Die CSS-Transition-Effekte in `SceneVideo` (Zeile 425-484) berechnen nur die **Exit-Animation** der aktuellen Szene (Fade-Out, Wipe-Out etc.). Damit diese sichtbar wird, muss die nächste Szene **darunter** als Underlay gerendert werden. Genau das ist aber seit dem letzten Fix in Zeile 758 mit `!previewMode && ...` deaktiviert. Ergebnis: Die aktuelle Szene fadet zu Schwarz statt zur nächsten Szene — das sieht aus wie ein harter Cut.

### Lösung

**Datei: `src/remotion/templates/DirectorsCutVideo.tsx`**

1. **`premountFor` auf alle Szenen-Sequences setzen** (30 Frames = 1 Sekunde bei 30fps)
   - Dadurch beginnt der Video-Decoder der nächsten Szene 1 Sekunde vor dem sichtbaren Schnitt zu laden
   - Remotion rendert das premounted Element mit `opacity: 0` und eingefrorenem Frame, also kein visueller Einfluss
   - Das ist die von Remotion empfohlene Lösung für genau dieses Problem

2. **Underlay auch im Preview-Modus aktivieren, aber leichtgewichtig**
   - Den `!previewMode &&` Guard aus Zeile 758-759 entfernen
   - Die Underlay-Szene wird **ohnehin bereits premounted** (durch Punkt 1), also ist der zusätzliche Decoder-Aufwand minimal
   - Transitions (Crossfade, Wipe, Dissolve) werden dadurch im Editor wieder sichtbar: Die aktuelle Szene fadet/wipet weg und gibt den Blick auf die nächste Szene darunter frei
   - Der Underlay bekommt ebenfalls `premountFor`, sodass er vor dem Transition-Zeitpunkt geladen ist

### Konkreter Code-Change

```text
Zeile 758-759 (Underlay Guard):
  VORHER:  {!previewMode && hasTransitionToNext && nextScene && ...}
  NACHHER: {hasTransitionToNext && nextScene && ...}

Zeile 792-794 (Haupt-Sequence):
  VORHER:  <Sequence from={sceneStartFrame} durationInFrames={sceneDurationFrames}>
  NACHHER: <Sequence from={sceneStartFrame} durationInFrames={sceneDurationFrames} premountFor={30}>

Zeile 760-762 (Underlay-Sequence):
  VORHER:  <Sequence from={...} durationInFrames={transitionDurationFrames}>
  NACHHER: <Sequence from={...} durationInFrames={transitionDurationFrames} premountFor={30}>
```

### Was sich dadurch ändert
- Szenenübergänge werden 1 Sekunde vorgeladen — kein Ruckeln mehr
- Crossfade/Dissolve/Wipe/Fade-Transitions sind im Editor wieder sichtbar
- Per-Scene-Architektur bleibt vollständig erhalten
- Finaler Render bleibt unverändert

### Was sich nicht ändert
- Szenen können weiterhin verlängert/verkürzt werden
- Slow-Motion und Speed-Ramping funktionieren weiterhin
- Audio-Handling bleibt identisch
- Export-Qualität bleibt identisch

### Dateien
1. `src/remotion/templates/DirectorsCutVideo.tsx`

