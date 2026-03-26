

## Fix: Flüssige Übergänge mit Remotion TransitionSeries

### Kernproblem

Die bisherige manuelle Implementierung (Underlay-Sequence + Opacity-Fade) ist fundamental fragil:
- Die Transition-Logik berechnet Exit-Animationen manuell pro Szene
- Das Underlay-Timing, die z-Reihenfolge und das Premounting müssen alle manuell synchronisiert werden
- Jeder kleine Fehler führt zu unsichtbaren Übergängen oder Rucklern
- Step 2 (natives Video) kann physisch keine echten Crossfades zeigen — nur Overlay-Hinweise

Remotion bietet genau dafür `@remotion/transitions` mit `TransitionSeries` — das die gesamte Overlap-Logik, z-Reihenfolge und das Premounting automatisch handhabt.

### Lösung

**1. `@remotion/transitions` installieren**

**2. `DirectorsCutVideo.tsx` — Scene-Rendering auf TransitionSeries umbauen**

Statt manuell Underlay-Sequences + Opacity-Fades zu berechnen:

```text
VORHER (manuell, fehleranfällig):
  scenes.map(scene => {
    // Underlay Sequence manuell platziert
    // Haupt-Sequence mit manueller Opacity-Berechnung
    // Timing muss exakt stimmen
  })

NACHHER (Remotion-nativ):
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={scene1Frames}>
      <SceneVideo scene={scene1} ... />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({ durationInFrames: 15 })}
    />
    <TransitionSeries.Sequence durationInFrames={scene2Frames}>
      <SceneVideo scene={scene2} ... />
    </TransitionSeries.Sequence>
    ...
  </TransitionSeries>
```

Konkret:
- Die `sortedScenes` werden zu `TransitionSeries.Sequence` gemappt
- Jede `TransitionAssignment` wird zu einem `TransitionSeries.Transition` mit der passenden `presentation`:
  - `crossfade` / `dissolve` / `fade` → `fade()`
  - `wipe-left` → `wipe({ direction: 'from-left' })`
  - `slide-left` / `push-left` → `slide({ direction: 'from-left' })`
  - `none` → kein Transition-Element eingefügt
- Timing über `linearTiming({ durationInFrames })` basierend auf der konfigurierten Dauer
- Die manuelle `transitionEffects`-Berechnung in SceneVideo (Zeilen 425-496) wird entfernt — TransitionSeries handhabt das
- Die manuelle Underlay-Sequence (Zeilen 770-801) wird entfernt

**3. `SceneVideo` vereinfachen**
- Die gesamte Exit-Transition-Logik (opacity/clipPath/transform-Berechnung) entfernen
- SceneVideo rendert nur noch das Video mit Effekten (Filter, Ken Burns, Vignette) — keine Transition-Mathematik mehr
- Weniger Code, weniger Fehlerquellen

**4. Dauer-Berechnung anpassen**
- TransitionSeries verkürzt die Gesamtdauer um die Summe aller Transition-Dauern
- Die `durationInFrames` des Players muss entsprechend berechnet werden:
  `totalFrames = Σ(sceneDurationFrames) - Σ(transitionDurationFrames)`

**5. Step 2 (NativeTransitionOverlay) bleibt**
- Ein einzelnes natives Video kann keine echten Crossfades zeigen
- Der bestehende CSS-Overlay bleibt als visueller Hinweis
- Das ist eine bewusste Einschränkung der Analyse-Vorschau

### Was sich dadurch ändert
- Übergänge in Step 3+ funktionieren zuverlässig (Remotion handhabt Timing, z-Order, Premounting)
- Kein Ruckeln mehr an Szenengrenzen (TransitionSeries premountet automatisch)
- Deutlich weniger Code in der Transition-Logik
- Per-Scene-Architektur bleibt: Jede Szene hat eigene Dauer, Effekte, PlaybackRate

### Was sich nicht ändert
- Szenen können weiterhin verlängert/verkürzt werden
- Slow Motion, Filter, Ken Burns etc. bleiben
- Audio-Handling bleibt identisch
- Step 2 Analyse-Preview bleibt natives Video

### Dateien
1. `package.json` — `@remotion/transitions` hinzufügen
2. `src/remotion/templates/DirectorsCutVideo.tsx` — TransitionSeries statt manueller Underlay-Logik
3. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — Dauer-Berechnung für TransitionSeries-Overlap anpassen

