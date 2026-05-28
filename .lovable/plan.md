## Problem

Wenn du in Step 5 (Vorschau & Export) wechselst, crasht die Seite mit:
`Cannot read properties of undefined (reading 'segments')`

Ursache: In `src/components/universal-creator/steps/PreviewExportStep.tsx` wird an zwei Stellen ungeschützt auf `subtitleConfig.segments.length` (und `subtitleConfig.style.font/fontSize`) zugegriffen. Wenn Step 4 übersprungen wurde oder `subtitleConfig` `undefined`/leer ist, knallt der Render.

- Zeile 554: `subtitleConfig.segments.length`
- Zeile 555: `subtitleConfig.style.font`, `subtitleConfig.style.fontSize`
- Zeile 718: `subtitleConfig.segments.length`

(Andere Stellen, z.B. `SubtitleTimingStep.tsx` und `UniversalCreator.tsx`, nutzen bereits korrekt `subtitleConfig?.segments`.)

## Fix

In `PreviewExportStep.tsx`:

1. Zeile 552–556: Untertitel-/Style-Zeilen nur rendern wenn `subtitleConfig?.segments?.length` > 0 (mit optional chaining für `style`).
2. Zeile 716–719: `subtitleConfig?.segments?.length ?? 0` verwenden.

Reines Defensive-Rendering, keine Logik-Änderung. Danach lädt Step 5 sauber, auch wenn keine Untertitel erzeugt wurden.
