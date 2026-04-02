

## Fix: Subtitle Safe Zone wird nicht an den Export weitergereicht

### Problem

Die gesamte Export-Pipeline ignoriert `subtitleSafeZone`:

1. **`DirectorsCut.tsx`** übergibt `subtitleSafeZone` nicht an `ExportRenderStep`
2. **`ExportRenderStep.tsx`** hat keinen `subtitleSafeZone`-Prop und setzt Zeile 410 hart auf `undefined`
3. **`render-directors-cut/index.ts`** kennt `subtitle_safe_zone` nicht und leitet es nicht an Lambda weiter
4. **`DirectorsCutVideo.tsx`** (Remotion Template) hat keine Crop-Logik

Der Preview Player wendet den Crop lokal via CSS an — aber der Export rendert das Originalvideo ohne jede Änderung.

### Lösung: Safe Zone durch die komplette Pipeline schleusen

**1. `ExportRenderStep.tsx`**
- Neuen Prop `subtitleSafeZone?: SubtitleSafeZone` hinzufügen
- Zeile 410: statt `undefined` die echten Werte übergeben wenn `enabled`

**2. `DirectorsCut.tsx`**
- `subtitleSafeZone={subtitleSafeZone}` an `ExportRenderStep` übergeben (ca. Zeile 845)

**3. `render-directors-cut/index.ts`**
- `subtitle_safe_zone` aus dem Request-Body extrahieren
- In den Remotion Lambda Payload als `inputProps` durchreichen

**4. `DirectorsCutVideo.tsx`**
- Schema um `subtitleSafeZone` erweitern (bottomBandPercent, zoom, offsetY)
- Wrapper-Div um das `<Video>` mit `clip-path: inset(0 0 X% 0)` + `scale` + `translateY` — identisch zur Preview-Logik

### Betroffene Dateien

1. `src/pages/DirectorsCut/DirectorsCut.tsx` — Prop durchreichen
2. `src/components/directors-cut/steps/ExportRenderStep.tsx` — Prop annehmen und senden
3. `supabase/functions/render-directors-cut/index.ts` — an Lambda weiterleiten
4. `src/remotion/templates/DirectorsCutVideo.tsx` — Hard-Crop im Render anwenden

