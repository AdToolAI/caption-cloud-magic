

# Plan: Visuellen Stil in die Bildgenerierung durchdrücken

## Problem gefunden

Die Logs beweisen: `visualStyle: "comic"` kommt korrekt an. Auch der Prompt enthält `ART STYLE: comic` und der Style-Prefix `"clean business cartoon illustration, bold outlines, flat colors..."` wird gesetzt.

**Aber:** Die Scene-Descriptions vom Script-Generator enthalten weiterhin cinematic Sprache wie `"moving golden particles, dark void, bright central glow, dramatic volumetric lighting"`. Diese überstimmen den Comic-Prefix, weil Flux das Letztgenannte stärker gewichtet.

**Ursache in 2 Stellen:**

1. **Script-Generator** (`generate-script-inline.ts`, Zeile 387): Die `visualDescription`-Regel sagt nur `[OBJEKT] + [ZUSTAND] + [UMGEBUNG] + [BELEUCHTUNG]` — aber erwähnt den gewählten Stil nicht. Das AI-Modell generiert immer cinematic/realistische Beschreibungen, egal ob Comic oder Watercolor gewählt wurde.

2. **Prompt-Bau** (`generate-premium-visual/index.ts`): Der Style-Prefix steht am Anfang, die detaillierte Scene-Description kommt danach und dominiert.

## Lösung

### 1. Script-Generator: Stil in die visualDescription-Regel einbauen
**Datei:** `supabase/functions/_shared/generate-script-inline.ts`

Die Regel 7 im System-Prompt erweitern:

```
7. Jede visualDescription folgt: [OBJEKT/SZENE] + [ZUSTAND/DETAIL] + [UMGEBUNG] + [BELEUCHTUNG]
   WICHTIG: Passe die visualDescription an den visuellen Stil "${briefing.visualStyle}" an!
   - Bei "comic": Beschreibe Szenen wie Comic-Panels (bold lines, flat colors, speech bubbles, panels)
   - Bei "cartoon": Beschreibe Szenen wie Cartoon-Welten (rounded shapes, bright colors, playful)
   - Bei "cinematic": Beschreibe Szenen kinoreif (volumetric lighting, shallow depth of field)
   - Bei "watercolor": Beschreibe Szenen wie Aquarelle (soft washes, paper texture, gentle colors)
   - NIEMALS cinematic/realistische Beschreibungen für cartoon/comic Stile verwenden!
```

Zusätzlich eine Style-Mapping-Tabelle in den Prompt einfügen, die für jeden der 20 Stile 2-3 passende Bildbeschreibungs-Keywords vorgibt.

### 2. Prompt-Bau: Stil doppelt verstärken
**Datei:** `supabase/functions/generate-premium-visual/index.ts`

Den Style-Prefix nicht nur am Anfang, sondern auch am Ende als Suffix wiederholen:

```
[STYLE_PREFIX] + [scene description] + [anti-text rules] + "OVERRIDE STYLE: [STYLE_SUFFIX]"
```

Für "comic" würde das bedeuten:
- Prefix: `"clean business cartoon illustration, bold outlines, flat colors..."`
- Suffix: `"MUST be in comic book cartoon style with bold outlines and flat colors, NOT photorealistic, NOT cinematic"`

### 3. Style-spezifische Negative Prompts
Für Cartoon/Comic-Stile explizit ausschließen:
- `"photorealistic, volumetric lighting, film grain, lens flare, shallow depth of field"`

Für Cinematic-Stile ausschließen:
- `"cartoon, flat colors, bold outlines, vector art"`

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/_shared/generate-script-inline.ts` | Regel 7 um stilspezifische visualDescription-Anweisungen erweitern |
| `supabase/functions/generate-premium-visual/index.ts` | Style-Suffix am Ende wiederholen + stilspezifische Negative Prompts |

## Erwartetes Ergebnis
- Bei "Comic": Bilder sehen aus wie Comic-Illustrationen (bold outlines, flat colors)
- Bei "Cinematic": Bilder bleiben kinoreif (wie bisher)
- Bei "Watercolor": Bilder haben Aquarell-Ästhetik
- Der Stil wird sowohl in der Scene-Description als auch im Flux-Prompt doppelt durchgesetzt

