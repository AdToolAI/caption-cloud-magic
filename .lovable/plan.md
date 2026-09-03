# Analyse: Referenzbilder & exakte Pixelvorgabe im Picture Studio

Grundlage: `supabase/functions/generate-image-replicate/index.ts` (Provider-Aufrufe), `supabase/functions/generate-studio-image/index.ts` (Standard/Gemini-Pfad) und `src/config/pictureStudioModels.ts` (UI-Matrix).

## Was heute tatsächlich verschickt wird

| Modell (Tier) | Referenzbilder | Feld im Request | Pixel exakt vorgebbar? |
| --- | --- | --- | --- |
| Standard – Gemini 2.5 Flash Image | 1 (nur Edit-Modus) | `image_url`-Block im Chat-Body | Nein, nur `aspect_ratio` |
| Fast – Seedream 4 | mehrere (Array, ungekappt) | `image_input: string[]` | Nein, aktuell fix `size: '2K'` + Ratio (Provider könnte px) |
| Pro – Imagen 4 Ultra | keine | – (Stil nur über Prompt) | Nein, nur Ratio |
| Ultra – Nano Banana 2 | mehrere (Array, ungekappt) | `image_input: string[]` | Nein, nur Ratio |
| GPT Image 2 | keine (nur `/v1/images/generations`) | – | Ja, aber nur 3 feste Größen (1024x1024, 1536x1024, 1024x1536) |
| FLUX 1.1 Pro Ultra | genau 1 | `image_prompt: imageInputs[0]` | Nein, nur Ratio (4 MP fix) |
| Ideogram v3 Turbo | mehrere (nur Stil) | `style_reference_images: string[]` | Nein, nur Ratio |
| Recraft v3 | keine | – | Ja, feste Größenliste (1024x1024 … 1820x1024) |
| Qwen Image | genau 1 | `image: imageInputs[0]` | Nein, nur Ratio |

Die UI schickt maximal zwei Bilder (`referenceImageUrl` = Motiv, `styleReferenceUrl` = Stil). Echtes Multi-Reference (3+) ist im Backend also möglich, aber im Frontend nicht anbietbar.

## Kernaussagen

1. **Mehrere Referenzbilder** funktionieren real nur bei **Seedream 4**, **Nano Banana 2** und **Ideogram** (dort nur als Stilreferenz). FLUX und Qwen nehmen genau ein Bild und ignorieren das zweite still. Imagen 4, Recraft und GPT-Image bekommen gar kein Bild — bei diesen Tiers verpufft ein hochgeladenes Referenzbild wirkungslos.
2. **Exakte Pixelanzahl** ist heute nirgends frei wählbar. Nur GPT-Image-2 und Recraft arbeiten überhaupt pixelbasiert, aber mit einer festen Größenliste. Alle anderen laufen ratio-basiert; Seedream kennt zusätzlich eine `size`-Stufe (aktuell hart auf `2K`), Seedream und Qwen unterstützen providerseitig auch `width`/`height`, was wir nicht durchreichen.

## Vorschlag für einen späteren Umsetzungs-Gate (noch nicht ausgeführt)

- `PictureModelCapability` um `maxReferences`, `referenceKind` ('subject' | 'style' | 'none') und `pixelControl` ('none' | 'preset' | 'exact') erweitern.
- UI: Referenz-Upload nur zeigen, wenn das gewählte Modell ihn wirklich nutzt; Warnung statt stillem Ignorieren.
- Für Seedream/Qwen optional `width`/`height` durchreichen (exakte Pixel), für GPT-Image/Recraft die vorhandenen Presets als Auswahl sichtbar machen.
- Regressionstest: jedes Tier in `PICTURE_MODELS` muss zu den Feldern passen, die die Edge Function für dieses Tier setzt.
