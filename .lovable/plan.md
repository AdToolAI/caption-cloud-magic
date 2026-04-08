

## Plan: Fix — Szene 2 spielt nach Black Screen nicht ab

### Ursache

Nach dem Gap-Exit (Zeile 597-625) wird `video.play()` aufgerufen, aber mehrere Probleme verhindern zuverlässige Wiedergabe:

1. **Seek nicht abgeschlossen**: `video.currentTime` wird gesetzt und sofort `play()` aufgerufen. Der Browser hat den Seek aber noch nicht abgeschlossen → `findSceneBySourceTime` findet im nächsten Tick die Szene nicht → fällt in den Else-Block
2. **Cooldown-Block ohne Timeline-Advance**: Während des 15-Frame-Cooldowns (Zeile 803-805) wird `timelineTime = visualTimeRef.current` gesetzt, aber die Timeline wird nicht weitergeführt — sie friert ein
3. **Video bleibt stehen**: Wenn `findSceneBySourceTime` nach dem Cooldown die Szene findet, kann es sein, dass die Timeline-Position nicht zum Video passt und der Player verwirrt wird

### Lösung

**Datei: `DirectorsCutPreviewPlayer.tsx`**

1. **`seeked`-Event abwarten vor Play**: Nach dem Seek bei Gap-Exit einen `seeked`-Listener setzen, der erst nach Abschluss des Seeks `video.play()` und die Audio-Resync-Logik ausführt. Bis dahin Video in "wartend"-Zustand halten.

2. **Cooldown-Block Timeline-Advance**: Im Cooldown-Else-Block (Zeile 803-805) die Timeline nicht einfrieren, sondern basierend auf der Video-Source-Time korrekt vorwärts mappen — den `lastSceneIndexRef` nutzen, um die richtige Szene zu finden und die Timeline-Zeit korrekt zu berechnen

3. **`lastSceneIndexRef` bei Gap-Exit setzen**: Bereits in Zeile 624-625 vorhanden, aber sicherstellen, dass `pendingSceneAdvanceRef` ebenfalls gesetzt wird, damit die Szenenerkennung nach dem Seek bevorzugt die richtige Szene matcht

### Konkreter Ansatz

```typescript
// Gap exit — wait for seek before playing
if (nextScene && currentTL >= nextScene.start_time) {
  inGapRef.current = false;
  gapLastTimestampRef.current = 0;
  gapCooldownRef.current = 15;
  const nextSourceStart = nextScene.original_start_time ?? nextScene.start_time;
  video.currentTime = nextSourceStart + 0.05;
  video.playbackRate = (nextScene as any).playbackRate ?? 1;
  video.style.opacity = '1';
  visualTimeRef.current = nextScene.start_time;
  
  const idx = sortedScenes.indexOf(nextScene);
  if (idx >= 0) {
    lastSceneIndexRef.current = idx;
    pendingSceneAdvanceRef.current = { targetIndex: idx, framesLeft: 15 };
  }

  // Play video unconditionally (was paused during gap)
  video.play().catch(() => {});
  
  // Resume audio...
}
```

```typescript
// Cooldown block — advance timeline from video instead of freezing
if (gapCooldownRef.current > 0) {
  // Use lastSceneIndexRef to map source time to timeline
  const sceneIdx = lastSceneIndexRef.current;
  if (sceneIdx >= 0 && sceneIdx < sortedScenes.length) {
    const s = sortedScenes[sceneIdx];
    const srcStart = s.original_start_time ?? s.start_time;
    const rate = (s as any).playbackRate ?? 1;
    const offset = (videoSourceTime - srcStart) / rate;
    timelineTime = s.start_time + Math.max(0, offset);
  } else {
    timelineTime = visualTimeRef.current;
  }
}
```

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `DirectorsCutPreviewPlayer.tsx` | Play unconditionally bei Gap-Exit, pendingSceneAdvance setzen, Cooldown-Block Timeline von Video ableiten |

### Ergebnis

- Nach dem Black Screen wird Szene 2 zuverlässig abgespielt
- Timeline friert nicht mehr während des Cooldowns ein
- Szenenerkennung nach Gap-Exit bevorzugt die korrekte nächste Szene

