

## Fix: Text-Overlay-Animationen im Director's Cut Preview

### Problem

In `DirectorsCutPreviewPlayer.tsx` (Zeile 1076-1094) werden Text-Overlays als statische `<div>`s gerendert. Die `animation`-Property des Overlays wird komplett ignoriert — kein fadeIn, kein scaleUp, kein Bounce, nichts.

Die existierende `TextOverlayRenderer`-Komponente nutzt Remotion's `useCurrentFrame()` und funktioniert nur im Remotion-Renderpfad, nicht in der nativen Video-Preview.

### Lösung

Eine neue Komponente `NativeTextOverlayRenderer` erstellen, die CSS-Animationen statt Remotion-Hooks nutzt und im nativen Preview-Player funktioniert.

### Umsetzung

**Neue Datei: `src/components/directors-cut/preview/NativeTextOverlayRenderer.tsx`**

- Bekommt das Overlay-Objekt + `displayTime` als Props
- Berechnet `elapsed = displayTime - overlay.startTime` für zeitbasierte Animationen
- Implementiert alle 6 Animationstypen mit CSS transitions/keyframes:
  - **fadeIn**: opacity 0→1 + translateY über ~0.5s
  - **scaleUp**: scale 0→1 mit CSS spring-ähnlichem easing
  - **bounce**: translateY mit cubic-bezier bounce
  - **typewriter**: Zeichen progressiv einblenden basierend auf elapsed time
  - **highlight**: Hintergrund-Sweep von 0% auf 100% Breite
  - **glitch**: translateX oszillation + farbige text-shadows
- Positionierung (top/center/bottom/custom) wie bisher
- Styling (fontSize, color, backgroundColor, shadow, fontFamily) wie bisher

**Änderung: `DirectorsCutPreviewPlayer.tsx`**

- Import der neuen `NativeTextOverlayRenderer`
- Zeile 1076-1094: Statische `<div>`s durch `<NativeTextOverlayRenderer>` ersetzen

### Technische Details

- Animationen werden zeitbasiert berechnet: `elapsed = displayTime - startTime`
- Kein Remotion-Dependency — rein CSS + JS Math
- Typewriter nutzt `text.substring(0, Math.floor(elapsed * charsPerSecond))`
- Glitch nutzt `Math.sin(elapsed * frequency)` für Oszillation

### Betroffene Dateien

1. **Neu**: `src/components/directors-cut/preview/NativeTextOverlayRenderer.tsx`
2. **Edit**: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` (Overlay-Rendering ersetzen)

