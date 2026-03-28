

## Fix: Stottern & Gummibandeffekt bei Übergängen 2 und 3

### Ursache

Zwei Probleme im rAF-Loop:

1. **Scene-Boundary-Logik feuert während Transitions**: Zeile 399 (`videoSourceTime >= srcEnd - 0.02`) ist während der gesamten Transition nach der Szenengrenze **jeden Frame true**. Obwohl kein Seek passiert (weil `findActiveTransition` die Transition erkennt), wird die Logik trotzdem jedes Mal durchlaufen und erzeugt unnötige Berechnungen/Checks.

2. **Audio-Korrektur während Transitions = Gummibandeffekt**: Zeile 442 korrigiert `sourceAudio.currentTime = timelineTime` wenn drift > 0.5s. Während einer Transition fließt `timelineTime` über `scene.end_time` hinaus (gewollt), aber das Audio spielt linear. Die Timeline-Zeit kann leicht schwanken (durch die Toleranz in `findSceneBySourceTime`), was zu wiederholten Audio-Seeks führt → Gummiband-Sound.

### Lösung

**Datei: `DirectorsCutPreviewPlayer.tsx`** — rAF-Loop anpassen:

1. **Transition-Guard für Scene-Boundary-Logik**: Wenn `findActiveTransition(timelineTime)` aktiv ist → den gesamten Block (Zeilen 399-418) überspringen. Das Video läuft natürlich weiter, der Canvas-Renderer zeigt den Übergang, kein Seeking nötig.

```typescript
// Zeile 394-418 — NUR ausführen wenn KEINE Transition aktiv
const activeTransForBoundary = findActiveTransition(timelineTime);
if (!activeTransForBoundary) {
  // Existing scene-boundary-crossing logic...
  if (videoSourceTime >= srcEnd - 0.02) { ... }
}
```

2. **Audio-Korrektur während Transitions pausieren**: Kein `sourceAudio.currentTime` setzen solange eine Transition läuft → eliminiert den Gummiband-Sound komplett.

```typescript
// Zeile 440-445 — Audio nur korrigieren wenn KEINE Transition
const activeTransForAudio = findActiveTransition(timelineTime);
if (sourceAudioRef.current && !sourceAudioRef.current.paused && !activeTransForAudio) {
  if (Math.abs(sourceAudioRef.current.currentTime - timelineTime) > 0.5) {
    sourceAudioRef.current.currentTime = timelineTime;
  }
}
```

3. **`findActiveTransition` einmal pro Frame cachen** statt 3x aufrufen: Am Anfang des tick einmal berechnen und wiederverwenden.

### Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — rAF-Loop: Transition-Guard + Audio-Fix

### Ergebnis
- Kein Stottern mehr bei Übergängen (keine Seeks während Transitions)
- Kein Gummiband-Sound (Audio läuft ungestört durch Transitions)
- Performance besser (findActiveTransition nur 1x pro Frame)

