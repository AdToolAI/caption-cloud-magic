

## Plan: Audio im Black Screen (Gap) stumm schalten

### Problem

Wenn eine Lücke > 0.2s zwischen Szenen erkannt wird, wird das Video korrekt ausgeblendet (Black Screen), aber die drei Audio-Elemente (`sourceAudioRef`, `voiceoverAudioRef`, `backgroundMusicAudioRef`) spielen weiter. Der Nutzer hört also Sound, obwohl nichts zu sehen ist.

### Lösung

**Datei: `DirectorsCutPreviewPlayer.tsx`**

An **drei Stellen** im Code, wo `inGapRef.current = true` gesetzt wird (Gap-Entry), werden alle Audio-Elemente pausiert:

```typescript
sourceAudioRef.current?.pause();
voiceoverAudioRef.current?.pause();
backgroundMusicAudioRef.current?.pause();
```

An der **einen Stelle**, wo der Gap endet (`inGapRef.current = false` + Seek zur nächsten Szene), werden die Audio-Elemente zur neuen Position gesynct und wieder gestartet:

```typescript
// Seek audio to next scene's source start
const nextSourceStart = nextScene.original_start_time ?? nextScene.start_time;
if (sourceAudioRef.current && !originalAudioMutedRef.current && !isMutedRef.current) {
  sourceAudioRef.current.currentTime = nextSourceStart;
  sourceAudioRef.current.play().catch(() => {});
}
// Voiceover + Background Music: resume from timeline position
if (voiceoverAudioRef.current && !isMutedRef.current) {
  voiceoverAudioRef.current.currentTime = nextScene.start_time;
  voiceoverAudioRef.current.play().catch(() => {});
}
if (backgroundMusicAudioRef.current && !isMutedRef.current) {
  backgroundMusicAudioRef.current.currentTime = nextScene.start_time;
  backgroundMusicAudioRef.current.play().catch(() => {});
}
```

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `DirectorsCutPreviewPlayer.tsx` | Audio bei Gap-Entry pausieren, bei Gap-Exit zum nächsten Szenen-Zeitpunkt resyncen und fortsetzen |

### Ergebnis

- Black Screen = komplette Stille (kein Audio)
- Beim Übergang zur nächsten Szene startet der Sound korrekt an der richtigen Position

