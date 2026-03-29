

## Fix: Brand Logo ohne Hintergrund + schwarze Bildanzeige beheben

### Problem 1: Brand Logo wird mit Hintergrund generiert
Der Prompt-Modifier sagt aktuell "solid or transparent background" — das ist zu vage. Muss explizit auf "transparent background, no background" gesetzt werden.

### Problem 2: Generierte Bilder werden schwarz angezeigt
Die generierten PNGs haben oft Transparenz (besonders Logos). Die `ImageCard` hat einen dunklen Hintergrund (`bg-card/50`), und transparente PNGs verschmelzen damit zu Schwarz. Der Download funktioniert, weil der lokale Viewer einen hellen/Schachbrett-Hintergrund zeigt.

### Änderungen

**1. `supabase/functions/generate-studio-image/index.ts`**
- Brand-Logo Prompt-Modifier verstärken: "transparent background only, no background elements, isolated logo on transparent/white canvas"

**2. `src/components/picture-studio/ImageCard.tsx`**
- Schachbrett-Hintergrund (CSS checkerboard pattern) hinter dem Bild-Container setzen, damit transparente PNGs sichtbar werden
- Alternativ: weißer Hintergrund für den Bild-Bereich

### Technisches Detail

```css
/* Checkerboard pattern für Transparenz-Erkennung */
background-image: 
  linear-gradient(45deg, #ccc 25%, transparent 25%),
  linear-gradient(-45deg, #ccc 25%, transparent 25%),
  linear-gradient(45deg, transparent 75%, #ccc 75%),
  linear-gradient(-45deg, transparent 75%, #ccc 75%);
background-size: 20px 20px;
background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
```

### Betroffene Dateien
| Datei | Änderung |
|---|---|
| `supabase/functions/generate-studio-image/index.ts` | Brand-Logo Prompt: Transparenz erzwingen |
| `src/components/picture-studio/ImageCard.tsx` | Weißer/Schachbrett-Hintergrund für Bild-Container |

