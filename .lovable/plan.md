

# Diagnose: Die Bilder sind WebP, werden aber als JPEG deklariert

## Beweis

Ich habe die normalisierten Bilder für Szenen 1 und 4 (Index 0 und 3) direkt aus dem Storage heruntergeladen und analysiert:

```text
Scene 0 (Szene 1): render-ready/scene-0-...fpfw.jpg
  Datei-Header: "RIFF...WEBP VP8" ← WebP-Format!
  Content-Type beim Upload: image/jpeg ← FALSCH!
  Dateigröße: 39.992 Bytes (klein)

Scene 3 (Szene 4): render-ready/scene-3-...fydo.jpg  
  Datei-Header: "RIFF...WEBP VP8" ← WebP-Format!
  Content-Type beim Upload: image/jpeg ← FALSCH!
  Dateigröße: 59.972 Bytes (klein)
```

**Alle 5 Bilder** kommen von Replicate Flux 1.1 Pro mit `output_format: 'webp'`. Die Normalisierung lädt die rohen Bytes herunter und uploaded sie als `contentType: 'image/jpeg'` mit `.jpg`-Extension. Die Bytes bleiben aber WebP.

## Warum gerade Szene 1 und 4?

Die Bilder für Szenen 0 und 3 sind deutlich kleiner (40KB/60KB vs. 73-131KB). Kleinere WebP-Dateien mit falscher JPEG-Deklaration sind anfälliger für Dekodierungsfehler in der Lambda-Chromium-Umgebung. Der `<Img>`-Decoder im r42-Bundle erwartet JPEG-Magic-Bytes (`FF D8`), findet aber RIFF/WEBP — und bei bestimmten Dateigrößen schlägt das Content-Sniffing fehl.

## Fix: Format-Erkennung + korrekte Content-Type

### In `auto-generate-universal-video/index.ts`:

1. **Magic-Byte-Erkennung**: Nach dem Download die ersten 4-12 Bytes lesen und das tatsächliche Format erkennen (WebP: `RIFF...WEBP`, PNG: `\x89PNG`, JPEG: `\xFF\xD8`)
2. **Korrekter Content-Type**: Upload mit dem tatsächlichen Format (`image/webp` für WebP, `image/png` für PNG, `image/jpeg` für JPEG)
3. **Korrekte Extension**: `.webp`, `.png` oder `.jpg` je nach erkanntem Format
4. **Mindestgröße erhöhen**: Von 500 auf 2000 Bytes (sehr kleine Bilder sind oft fehlerhaft)
5. **Build-Tag**: `r49-format-detect-2026-03-09`

```text
Normalisierung (r49):
  1. GET Image (10s timeout)
  2. Detect format from magic bytes (RIFF=webp, 89504E47=png, FFD8=jpeg)
  3. Upload with CORRECT content-type and extension
  4. Verify GET (3s)
  5. Bei Fehler → Gradient
```

## Dateien

1. `supabase/functions/auto-generate-universal-video/index.ts` — Format-Erkennung in Normalisierungs-Loop, korrekte Content-Type/Extension

