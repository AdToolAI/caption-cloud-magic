

## Fix: Video-Stottern im Preview Player beseitigen

### Ursache des Stotterns

Der rAF-Loop setzt **jeden Frame** `video.currentTime = X`, sobald die Drift > 0.15s ist. Das Problem:

1. **Timeline-led statt Video-led**: Der Player zählt die Zeit selbst per `performance.now()` hoch und korrigiert dann das Video ständig darauf. Aber `video.currentTime = X` löst jedes Mal einen **Seek** im Browser-Decoder aus — das ist teuer und verursacht Frame-Drops.
2. **Während Transitions**: `video.currentTime` wird jeden Frame auf die Outgoing-Scene-Position gesetzt — also ~60 Seeks/Sekunde. Das ist der Hauptgrund für das Ruckeln.
3. **Drift-Schwelle 0.15s ist zu aggressiv**: Natürliche Video-Playback-Schwankungen von 100-200ms lösen ständig Korrekturen aus.

### Lösung: Video-led Playback mit seltenen Korrekturen

**Prinzip**: Das `<video>`-Element spielt von selbst smooth ab. Wir lesen `video.currentTime` als Quelle der Wahrheit und korrigieren nur bei echten Problemen (Szenenwechsel, Seek).

#### Änderungen im rAF-Loop (Zeilen 329-401):

1. **Video-led statt Timeline-led**: `visualTimeRef.current` folgt dem Video, nicht umgekehrt
2. **Drift-Schwelle auf 0.5s erhöhen**: Nur bei echtem Versatz korrigieren
3. **Während Transitions**: Video einfach weiterlaufen lassen (es spielt ja die Outgoing-Szene), kein `currentTime`-Setzen nötig
4. **Szenen-Grenze**: Nur bei Szenenwechsel einmal `currentTime` setzen, nicht jeden Frame

```typescript
// VORHER (schlecht - 60 seeks/s):
if (Math.abs(video.currentTime - outgoingTime) > 0.15) {
  video.currentTime = outgoingTime;
}

// NACHHER (gut - Video spielt natürlich):
// Während Transition: Video läuft weiter, kein Seek nötig
// Nur bei Szenenwechsel einmal korrigieren
```

#### Konkrete Optimierungen:

1. **`visualTimeRef` aus `video.currentTime` ableiten** statt aus wall-clock-delta — dann ist es immer synchron ohne Seeks
2. **Source-Time-Mapping invertieren**: Statt Timeline→Source→Seek machen wir Source→Timeline (lesen was das Video gerade zeigt und berechnen die Timeline-Position daraus)
3. **Seek nur bei Szenen-Sprüngen**: Wenn die aktuelle Szene sich ändert (neuer Szenen-Index), einmal `video.currentTime` setzen
4. **`lastSceneIndex` tracken**: Nur wenn sich der Index ändert, wird geseekt

### Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — rAF-Loop umbauen auf Video-led

### Ergebnis
- Video spielt nativ smooth ab ohne ständige Seeks
- Kein Stottern mehr bei Transitions (Canvas-Overlay braucht kein Seeking)
- Szenenwechsel: einmaliger Seek statt Dauer-Korrektur

