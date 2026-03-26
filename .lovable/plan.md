

## Fix: Bearbeitete Untertitel werden nicht in Preview und Render uebernommen

### Ursache

Die `MemoizedPlayer`-Komponente in `RemotionPreviewPlayer.tsx` (Zeile 51-61) hat einen **custom `React.memo` Vergleich**, der NUR auf Aenderungen der Audio-URLs reagiert:

```typescript
(prevProps, nextProps) => {
  // ONLY re-render if audio URLs change
  const audioEqual = 
    prevProps.inputProps?.backgroundMusicUrl === nextProps.inputProps?.backgroundMusicUrl &&
    prevProps.inputProps?.voiceoverUrl === nextProps.inputProps?.voiceoverUrl;
  return audioEqual; // true = skip update
}
```

Wenn Untertitel bearbeitet werden, aendern sich `subtitles` und `subtitleStyle` in den `inputProps` — aber der Vergleich ignoriert diese komplett. Der Player rendert weiter mit den alten Untertiteln.

### Aenderung

#### `src/components/universal-creator/RemotionPreviewPlayer.tsx`

Den `React.memo`-Vergleich erweitern, sodass er auch Untertitel-Aenderungen erkennt:

```typescript
(prevProps, nextProps) => {
  const audioEqual = 
    prevProps.inputProps?.backgroundMusicUrl === nextProps.inputProps?.backgroundMusicUrl &&
    prevProps.inputProps?.voiceoverUrl === nextProps.inputProps?.voiceoverUrl;
  
  // Also re-render when subtitles change
  const subtitlesEqual = 
    JSON.stringify(prevProps.inputProps?.subtitles) === JSON.stringify(nextProps.inputProps?.subtitles) &&
    JSON.stringify(prevProps.inputProps?.subtitleStyle) === JSON.stringify(nextProps.inputProps?.subtitleStyle);
  
  return audioEqual && subtitlesEqual;
}
```

Zusaetzlich `durationInFrames` in den Vergleich aufnehmen, da sich die Dauer ebenfalls aendern kann.

### Dateien
1. `src/components/universal-creator/RemotionPreviewPlayer.tsx` — Memo-Vergleich um Untertitel + Duration erweitern

