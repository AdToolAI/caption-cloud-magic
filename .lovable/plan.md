# Text-Overlays im Director's Cut: Rahmen-Treue (v409)

## Was schiefläuft

Im Screenshot ist das Video ein Hochformat-Clip, der im Player mittig mit schwarzen Balken links/rechts liegt. Die Overlays werden aber über die **gesamte Player-Fläche** gelegt, nicht über das tatsächlich sichtbare Videobild. Ergebnis: Text sitzt im schwarzen Balken bzw. schiebt sich "aus dem Rahmen".

Bestätigt im Code:
- `DirectorsCutPreviewPlayer.tsx` (Z. 1801, 1943-1946): Video liegt als `object-contain` im Container, die Overlays sind Geschwister mit `absolute inset-0` auf dem Container.
- `OverlayCanvasEditor.tsx` (Z. 151-154): Bühne ist fest `aspect-video`, das Video darin `object-contain` — bei Hochformat zeigt der Editor also eine andere Fläche als das Bild.
- `NativeTextOverlayRenderer.tsx`: Alt-Text-Overlays nutzen feste Pixel-Schriftgrößen (24/36/48/72px) und `maxWidth: 80%` bezogen auf den Container — kein Bezug zur Videobreite, keine Begrenzung nach oben/unten.

## Was gebaut wird

1. **Gemeinsame Bühnen-Berechnung**
   Eine kleine Hilfsfunktion/Hook, die aus Containergröße + Video-Seitenverhältnis das exakte sichtbare Bildrechteck (Breite, Höhe, Offset links/oben) liefert. Quelle des Seitenverhältnisses: `videoWidth/videoHeight` des Video-Elements, Fallback auf die Szenen-/Projekt-Ratio, Fallback 16:9.

2. **Overlay-Bühne statt Vollfläche (Vorschau)**
   Im Preview-Player bekommen alle Overlays einen eigenen Wrapper, der genau auf diesem Bildrechteck sitzt. Alle relativen Boxen (0..1) und Alt-Positionen beziehen sich dann auf das Videobild — identisch zum Export.

3. **Editor-Bühne folgt dem Video**
   `OverlayCanvasEditor` verliert das feste `aspect-video`: die Ziehfläche, das Raster und die Snap-Guides nutzen dasselbe Bildrechteck. Damit stimmt Ziehen im Editor, Vorschau und Export überein (WYSIWYG-Parität).

4. **Overflow-Schutz für Alt-Text-Overlays**
   - Schriftgröße wird relativ zur Bühnenbreite skaliert (1080px-Referenz, wie `LEGACY_FONT_SIZE_REL`), statt fixer px-Werte.
   - Text bleibt in einer Safe-Box (max. 86 % Breite, 80 % Höhe), mit Umbruch und mittiger Ausrichtung.
   - Animations-Transforms (bounce/scaleUp/glitch) werden gedeckelt, damit die Bewegung nicht über den Bildrand hinausläuft.

5. **Grafik-Overlays clampen**
   Beim Verschieben/Skalieren wird `clampBox` konsequent angewendet, damit keine Box (Banner, Lower Third, Badge) teilweise außerhalb des Bildes landen kann.

## Technische Details

- Neue Datei `src/lib/directors-cut/videoStageRect.ts` mit `computeStageRect({containerW, containerH, aspect})` plus `useVideoStageRect(videoRef, containerRef)`.
- `DirectorsCutPreviewPlayer.tsx`: Overlay-Map (Z. 1943-1946) und der Untertitel-Layer in einen `<div style={stageRect}>` mit `pointer-events-none` verlagern.
- `NativeTextOverlayRenderer.tsx`: `GraphicOverlayPreview` misst weiterhin `clientWidth` — durch die neue Bühne ist das automatisch die Videobreite. `LegacyTextOverlayPreview` erhält `stageWidth` und rechnet Schriftgrad = `overlayFontRel(overlay) * stageWidth`.
- `OverlayCanvasEditor.tsx`: `aspect-video` durch berechnetes Rechteck ersetzen; Pointer-Mathematik (Z. 80, 97) auf das Bühnenrechteck statt auf `getBoundingClientRect()` des Wrappers beziehen.
- Keine Änderung an `OverlayGraphic`/`OverlayElementRenderer` (Remotion-Export) nötig — dort ist die Fläche bereits das Videobild. Damit bleibt der Export unverändert und die Vorschau zieht nach.

## Nicht Teil dieses Schritts

Keine neuen Overlay-Typen, keine Änderungen an Presets, Brand-Kit-Styling oder Renderpfad im Export.
