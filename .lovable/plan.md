

## Fix: Content Creator Render schlaegt fehl — delayRender Timeout bei Video

### Ursache

Der Fehler ist ein `delayRender()` Timeout: Die Remotion `<Video>` Komponente versucht ein externes Video von `cdn.pixabay.com` zu laden. In der Lambda-Umgebung dauert das zu lange (298s Timeout). 

Im Code gibt es zwei Stellen in `UniversalCreatorVideo.tsx` wo `<Video>` ohne Timeout-Schutz verwendet wird:
- **Zeile 1789**: `<Video src={animatedVideoUrl}>` (Hailuo animated video)
- **Zeile 2005**: `<Video src={background.videoUrl}>` (Video-Hintergrund)

Fuer Bilder existiert bereits `SafeImg` mit 15s Timeout + Gradient-Fallback. Fuer Videos fehlt das Equivalent.

### Aenderung

#### `src/remotion/templates/UniversalCreatorVideo.tsx`

1. **Neue `SafeVideo` Komponente** (analog zu `SafeImg`):
   - Wraps `<Video>` mit eigenem `delayRender`/`continueRender`
   - 20s Timeout (Videos brauchen etwas laenger als Bilder)
   - Bei Timeout oder Error: Fallback auf `GradientFallback`
   - `onError` Handler fuer sofortigen Fallback bei kaputten URLs

2. **Zeile 1789 ersetzen**: `<Video src={animatedVideoUrl}>` → `<SafeVideo src={animatedVideoUrl}>`

3. **Zeile 2005 ersetzen**: `<Video src={background.videoUrl}>` → `<SafeVideo src={background.videoUrl}>`

```typescript
const SafeVideo: React.FC<{
  src: string;
  sceneType?: string;
  primaryColor?: string;
  style?: React.CSSProperties;
}> = ({ src, sceneType, primaryColor, style }) => {
  const [failed, setFailed] = React.useState(false);

  if (failed || !src) {
    return <GradientFallback sceneType={sceneType} primaryColor={primaryColor} />;
  }

  return (
    <Video
      src={src}
      style={style || { width: '100%', height: '100%', objectFit: 'cover' }}
      loop
      muted
      onError={() => setFailed(true)}
      pauseWhenBuffering
    />
  );
};
```

Zusaetzlich: Die globale `delayRender` default-Timeout von Remotion ist 30s. Das reicht fuer Videos. Das eigentliche Problem ist dass die `<Video>` Komponente bei einem Netzwerkfehler nie `continueRender` aufruft. Mit `onError` + Fallback wird der Render nicht blockiert.

### Dateien
1. `src/remotion/templates/UniversalCreatorVideo.tsx` — SafeVideo Komponente + beide Video-Stellen ersetzen

