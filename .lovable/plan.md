

## Fix: Audio-Geschwindigkeit an Speed Ramping anpassen

### Problem

Wenn Speed Ramping aktiv ist, wird nur `video.playbackRate` angepasst (Zeile 674-677). Die drei Audio-Elemente (`sourceAudioRef`, `voiceoverAudioRef`, `backgroundMusicAudioRef`) spielen weiterhin mit 1x Speed — dadurch laufen Audio und Video auseinander.

### Fix

In `DirectorsCutPreviewPlayer.tsx`, direkt nach dem Setzen von `video.playbackRate` (Zeile 676), auch die `playbackRate` der Audio-Elemente synchron setzen:

```typescript
// After setting video.playbackRate
if (sourceAudioRef.current && Math.abs(sourceAudioRef.current.playbackRate - targetRate) > 0.01) {
  sourceAudioRef.current.playbackRate = targetRate;
}
if (voiceoverAudioRef.current && Math.abs(voiceoverAudioRef.current.playbackRate - targetRate) > 0.01) {
  voiceoverAudioRef.current.playbackRate = targetRate;
}
if (backgroundMusicAudioRef.current && Math.abs(backgroundMusicAudioRef.current.playbackRate - targetRate) > 0.01) {
  backgroundMusicAudioRef.current.playbackRate = targetRate;
}
```

Dadurch passen sich Voiceover und Hintergrundmusik automatisch an die aktuelle Szenen-Geschwindigkeit an.

### Betroffene Datei

- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` (Zeilen 674-678)

