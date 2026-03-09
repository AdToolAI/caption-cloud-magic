

# Fix: Schwarze Szenen eliminieren — Maximal Stabile Pipeline

## Diagnose

Nach intensiver forensischer Analyse habe ich die **tatsächliche** Ursache identifiziert:

1. **Die r45 Pre-Render-Validation läuft NICHT** — keine Logs zeigen "pre-render-validation", und `r45_preValidation` ist `null` in den Progress-Daten. Der Edge Function Build-Tag ist zwar `r45` im Code, aber die Logs zeigen kein Deployment-Log.

2. **Das Remotion S3-Bundle ist veraltet** — `bundle_probe` im letzten Render zeigt `canary=2026-03-07-r42-errorIsolation`. Das SafeImg mit 8s-Timeout ist also **nicht aktiv** in Lambda, auch wenn der Code aktualisiert wurde.

3. **Einzelne Bild-URLs scheitern zufällig im Lambda-Netzwerk** — entweder durch Replicate-Temp-URLs (wenn der Storage-Upload in `generate-premium-visual` fehlschlägt) oder durch DNS/Connection-Limits beim Laden aus Supabase Storage.

## Lösung: "Maximal Stabil" Pipeline

Drei Maßnahmen, die zusammen **alle schwarzen Szenen eliminieren**:

### A. Asset-Normalisierung in `auto-generate-universal-video/index.ts`

Nach dem Pre-Render HEAD-Check (Zeile ~890): Jedes validierte Bild wird **aktiv heruntergeladen und als PNG re-uploaded** in den `video-assets` Bucket. Dies eliminiert:
- Replicate-Temp-URLs (die nach ~1h ablaufen)
- WebP-Decoding-Probleme in headless Chromium
- DNS-Varianz zwischen Edge Function und Lambda

```text
Für jede Szene mit imageUrl:
  1. HEAD-Check (5s timeout) — wie bisher
  2. GET das Bild (10s timeout)
  3. Re-Upload als PNG in video-assets/render-ready/
  4. Ersetze scene.imageUrl mit der neuen Supabase-Storage-URL
  5. Bei Fehler → SVG-Fallback (wie bisher)

Log: "[asset-normalize] Scene X: re-uploaded 245KB → {new_url}"
```

Build-Tag: `r46-asset-normalize-2026-03-09`

### B. SafeImg-Timeout von 8s auf 15s erhöhen + `delayRender` nutzen

In `UniversalCreatorVideo.tsx`: Die 8s sind zu knapp für Lambda. Erhöhung auf **15s** und Integration von Remotion's `delayRender`/`continueRender` API, damit Remotion nicht die Frames rendert bevor die Bilder geladen sind.

```typescript
const SafeImg = ({ src, sceneType, primaryColor, secondaryColor, style }) => {
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [handle] = React.useState(() => delayRender('SafeImg: ' + src?.slice(0, 40)));

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) {
        setFailed(true);
        continueRender(handle);
      }
    }, 15000); // 15s statt 8s
    return () => clearTimeout(timer);
  }, [src, loaded, handle]);

  if (failed) {
    continueRender(handle); // sicherheitshalber
    return <GradientFallback .../>;
  }
  return (
    <Img src={src}
      onLoad={() => { setLoaded(true); continueRender(handle); }}
      onError={() => { setFailed(true); continueRender(handle); }}
      style={style || ...}
    />
  );
};
```

### C. SVG-Fallback: Data-URI Pfad eliminieren

In `generateSVGFallbackToStorage` (Zeile 2092-2095): Der "last resort" Data-URI Pfad crasht Lambda. Wenn der Storage-Upload fehlschlägt, soll stattdessen ein **fest definierter Gradient** als CSS-Background im inputProps gespeichert werden (background.type = 'gradient' statt 'image').

```text
Zeile 2092-2095: Statt data:image/svg+xml;base64,...
→ Wirf Error, damit der Aufrufer den Scene-Background auf 'gradient' umstellt
```

## Dateien

1. `supabase/functions/auto-generate-universal-video/index.ts` — Asset-Normalisierung + Data-URI-Schutz + Build-Tag
2. `src/remotion/templates/UniversalCreatorVideo.tsx` — SafeImg mit delayRender + 15s Timeout

## Wichtiger Hinweis

Die Remotion-Template-Änderung (B) erfordert ein **neues S3-Bundle-Deployment**. Das aktuelle Bundle ist `r42` — es muss auf `r46` aktualisiert werden. Die Edge-Function-Änderungen (A, C) sind sofort aktiv und bilden die Hauptverteidigung.

