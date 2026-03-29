

## Feature: "Brand Logo" Style im KI Picture Studio

### Was wird gemacht

Ein neuer Style **"Brand Logo"** wird hinzugefügt, der auf Logo-Generierung optimierte Prompt-Modifier nutzt (clean vectors, scalable design, negative space, keine fotografischen Elemente). Zusätzlich werden logo-relevante Seitenverhältnisse ergänzt.

### Änderungen

**1. `src/components/picture-studio/ImageGenerator.tsx`**
- Neuen Style `{ value: 'brand-logo', label: 'Brand Logo' }` zum STYLES-Array hinzufügen
- Neue Seitenverhältnisse für Logos ergänzen:
  - `1:1 Quadrat` (App Icon, Favicon) — existiert bereits
  - `4:3 Landscape` (Website-Header-Logo)
  - `3:4 Portrait` (Vertikales Logo)
  - `2:1 Wide` (Banner-Logo, Social Media Cover)

**2. `supabase/functions/generate-studio-image/index.ts`**
- Neuen `styleModifiers`-Eintrag für `brand-logo`:
  ```
  'brand-logo': 'professional brand logo design, clean vector style, 
  scalable, minimalist, iconic symbol, negative space, no photographic 
  elements, no text unless specified, solid or transparent background, 
  corporate identity quality, Adobe Illustrator style'
  ```

### Ergebnis
- Der User wählt "Brand Logo" als Style und kann verschiedene Seitenverhältnisse für unterschiedliche Logo-Einsatzzwecke generieren
- Die Prompt-Modifier sorgen dafür, dass das KI-Modell Logo-typische Ergebnisse liefert (clean, skalierbar, ikonisch)

