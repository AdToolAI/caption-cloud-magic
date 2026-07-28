## Problem

Stufe 3 (Scenes) zeigt die Live-Preview über ein simples `<div>` mit `aspectRatio = formatConfig` und `object-contain` — das Portrait-Video erscheint korrekt im vollen 9:16-Rahmen. Ab Stufe 4 (Audio) übernimmt der `RemotionPreviewPlayer`, dessen Frame aktuell **hart auf 16:9 gepinnt** ist (`aspectRatio: 16/9`, `maxWidth: 720px`, `maxHeight: 55vh`). Dadurch schrumpft dasselbe 9:16-Video zu einem schmalen, letterboxten Streifen in der Mitte — der Nutzer nimmt das als „geschnitten" wahr.

## Fix — `src/components/universal-creator/RemotionPreviewPlayer.tsx`

Frame-Container wieder an das **Composition-Format** koppeln (wie in Stufe 3), aber mit vernünftiger Höhen-Deckelung, damit Portrait nicht die halbe Seite füllt:

```tsx
style={{
  aspectRatio: `${width} / ${height}`,   // folgt 9:16 / 1:1 / 16:9
  width: '100%',
  maxHeight: '65vh',                     // verhindert überlange Portrait-Rahmen
  marginInline: 'auto',
}}
```

Der Remotion `<Player>` bleibt bei `width: 100% / height: 100%` — er füllt den Frame ohne Letterbox, weil Frame- und Composition-Aspect nun identisch sind.

Effekt:
- 9:16 → hoher, schmaler Rahmen, Video füllt ihn komplett (identisch zu Stufe 3, kein „Cut").
- 16:9 → breiter Rahmen, Video füllt ihn.
- 1:1 → quadratischer Rahmen.
- `maxHeight: 65vh` verhindert, dass das Portrait-Fenster die Viewport-Höhe sprengt.

Rein Frontend, keine Änderung an Composition, Render-Payload oder Backend. Keine Änderung an den anderen Callern (`PreviewExportStep`), die schon per `previewMaxWidth`-Wrapper skalieren.

## Verifikation

- Playwright-Screenshot Stufen 3, 4, 5 mit 9:16 @ 1280×900: gleiche visuelle Größe des Video-Rahmens, keine Letterbox-Balken, kein Scroll.
- Kurzcheck 16:9 und 1:1: Frame passt sich an, Video füllt ohne Balken.
