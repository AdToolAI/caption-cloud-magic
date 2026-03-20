

# Plan: Echte Stilrichtungen für die Bildgenerierung (keine Filter)

## Problem

Der `UniversalVideoStyle`-Typ definiert bereits 14 Stile, aber nur 6 davon sind tatsächlich in der Bildgenerierung implementiert. Die restlichen (`cinematic`, `documentary`, `minimalist`, `bold-colorful`, `vintage-retro`, `hand-drawn`, `motion-graphics`, `photo-realistic`) fallen auf den Fallback `flat-design` zurück. Das sind keine CSS-Filter, sondern echte Prompt-basierte Stilrichtungen, die das KI-Bildmodell (Flux 1.1 Pro) direkt steuern.

## Neue Stile + fehlende aktivieren

| Stil | Beschreibung | Prompt-Richtung |
|------|-------------|-----------------|
| `cartoon` | Bunter Cartoon, übertriebene Proportionen | Bright cartoon illustration, bold outlines, exaggerated shapes |
| `watercolor` | Aquarell-Ästhetik, weiche Verläufe | Watercolor painting, soft washes, artistic brushstrokes |
| `cinematic` *(existiert im Typ)* | Filmische Tiefenschärfe, dramatisch | Cinematic still frame, dramatic lighting, depth of field |
| `photo-realistic` *(existiert im Typ)* | Fotorealistische Szenen | Photorealistic, natural textures, professional photography |
| `hand-drawn` *(existiert im Typ)* | Skizzen-/Pencil-Stil | Hand-drawn pencil sketch, artistic linework |
| `vintage-retro` *(existiert im Typ)* | 70er/80er Retro-Look | Retro vintage illustration, warm muted tones, 70s aesthetic |
| `bold-colorful` *(existiert im Typ)* | Pop-Art-artig, kräftige Farben | Bold colorful pop-art, vivid saturated colors |
| `minimalist` *(existiert im Typ)* | Extrem reduziert, viel Weißraum | Ultra minimalist, vast negative space, single accent color |
| `neon-cyberpunk` | Neon-Farben, futuristisch | Neon-lit cyberpunk scene, glowing edges, dark background |
| `paper-cutout` | Papier-Scherenschnitt | Paper cut-out craft illustration, layered paper textures |
| `clay-3d` | Claymation/Knete-Look | Clay render, plasticine texture, stop-motion aesthetic |
| `anime` | Anime/Manga-Stil | Anime illustration, cel-shaded, vibrant Japanese animation style |

## Technische Änderungen

### Schritt 1: Typen erweitern
**Dateien:** `src/types/explainer-studio.ts`, `src/types/universal-video-creator.ts`

- `ExplainerStyle` um neue Stile erweitern: `cartoon`, `watercolor`, `neon-cyberpunk`, `paper-cutout`, `clay-3d`, `anime`
- `UniversalVideoStyle` um `cartoon`, `watercolor`, `neon-cyberpunk`, `paper-cutout`, `clay-3d`, `anime` erweitern

### Schritt 2: STYLE_PROMPTS im Bildgenerator
**Datei:** `supabase/functions/generate-premium-visual/index.ts`

12 neue Einträge in `STYLE_PROMPTS` mit optimierten Flux-1.1-Pro-Prompts. Jeder Prompt enthält die "no people"-Regel. Die bereits im Typ definierten aber nicht implementierten Stile (`cinematic`, `photo-realistic`, `hand-drawn`, `vintage-retro`, `bold-colorful`, `minimalist`, `documentary`, `motion-graphics`) werden ebenfalls aktiviert.

### Schritt 3: VALID_STYLES erweitern
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

`VALID_STYLES` Array um alle neuen Stile erweitern, damit sie bei der Video-Generierung akzeptiert werden.

### Schritt 4: STYLE_PRESETS für UI
**Datei:** `src/types/explainer-studio.ts`

`STYLE_PRESETS` Array um neue Einträge mit passenden Farbpaletten und Beschreibungen erweitern.

### Schritt 5: StylePreviewGrid UI
**Datei:** `src/components/explainer-studio/StylePreviewGrid.tsx`

Icons/Symbole für alle neuen Stile hinzufügen (z.B. 🎨 für Watercolor, 🖍 für Cartoon, ⬡ für Cyberpunk etc.).

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/types/explainer-studio.ts` | ExplainerStyle + STYLE_PRESETS erweitern |
| `src/types/universal-video-creator.ts` | UniversalVideoStyle erweitern |
| `supabase/functions/generate-premium-visual/index.ts` | 12+ neue STYLE_PROMPTS |
| `supabase/functions/auto-generate-universal-video/index.ts` | VALID_STYLES erweitern |
| `src/components/explainer-studio/StylePreviewGrid.tsx` | UI-Icons für neue Stile |

## Wichtig

- Alle neuen Stile erben automatisch die Anti-Text- und Anti-Personen-Regeln (Rule 15, Keyword Sanitizer, Negativ-Prompts)
- Kein CSS-Filter-Ansatz — die Stile wirken direkt auf die KI-Bildgenerierung via Prompt-Engineering
- Edge Functions werden sofort aktiv, Frontend braucht Redeploy

