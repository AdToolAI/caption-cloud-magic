

## Fix: Alle Übergänge (Crossfade, Dissolve, Fade, Blur etc.) sichtbar machen

### Problem

Der Renderer hat zwei Code-Pfade (Zeile 122-180 in `useTransitionRenderer.ts`):

1. **Opacity-basierte Übergänge** (crossfade, dissolve, fade, blur) → Canvas-Pfad mit `frameCacheRef`
2. **Räumliche Übergänge** (slide, push, wipe, zoom) → Dual-Video-CSS-Pfad

**Der Canvas-Pfad scheitert immer**, weil `useFrameCapture.ts` das Capture-Video mit `crossOrigin = 'anonymous'` erstellt (Zeile 45). S3-Videos liefern keine CORS-Header → `createImageBitmap()` schlägt fehl → `frameCacheRef` bleibt leer → der Fallback-Code (Zeilen 155-163) setzt zwar `base.style.opacity`, aber ohne eingefrorenes Bild wirkt der Übergang kaum sichtbar.

Slide funktioniert, weil es den `else`-Pfad (Zeile 164+) nutzt — reines CSS mit zwei Videos.

### Lösung: Ein einziger Dual-Video-CSS-Pfad für ALLE Übergänge

Die `if (isOpacityBased && canvas)` Verzweigung (Zeilen 122-163) wird komplett entfernt. Alle Transition-Typen nutzen denselben Pfad wie Slide/Push — beide Videos laufen, CSS-Styles werden von `getTransitionStyles()` geliefert.

`getTransitionStyles()` in `NativeTransitionLayer.tsx` liefert bereits korrekte Werte für alle Typen:
- Crossfade/Dissolve: `base.opacity: 1→0`, `incoming.opacity: 0→1`  
- Fade: base aus → incoming ein (über Schwarz)
- Blur: opacity + filter
- Wipe: clipPath
- Slide/Push: transform
- Zoom: scale + opacity

**Datei: `useTransitionRenderer.ts`**
- `OPACITY_BASED_TYPES` Konstante entfernen
- Canvas-Verzweigung (Zeilen 122-163) entfernen
- Nur den bestehenden Dual-Video-CSS-Block (Zeilen 164-180) behalten, für ALLE Typen
- Canvas wird nie gezeigt (`canvas.style.display = 'none'` bleibt)

**Datei: `useFrameCapture.ts`** — bleibt unverändert (wird nicht mehr aktiv genutzt, kann später aufgeräumt werden)

### Betroffene Datei
- `src/components/directors-cut/preview/useTransitionRenderer.ts` — Canvas-Branching entfernen, einheitlicher CSS-Pfad

### Ergebnis
- Crossfade, Dissolve, Fade, Blur funktionieren genauso zuverlässig wie Slide
- Keine CORS-Abhängigkeit mehr
- Alle angebotenen Übergänge (none, crossfade, fade, dissolve, wipe, slide) sind im Preview sichtbar

