# Picture Studio — Modell-Fähigkeitsmatrix

Einzige Quelle der Wahrheit: `supabase/functions/_shared/pictureModelCapabilities.ts`.
`src/config/pictureModelCapabilities.ts` re-exportiert diese Datei, damit UI und
Edge Functions nicht auseinanderlaufen können. Paritätstests:
`src/config/__tests__/pictureModelCapabilities.test.ts`.

| Tier | Modell | Referenzen (Motiv / Stil) | Request-Feld | Größensteuerung |
| --- | --- | --- | --- | --- |
| standard | Gemini 2.5 Flash Image | 3 / 1 | Chat `image_url`-Blöcke | Ratio (Prompt) |
| fast | Seedream 4 | 10 / 10 | `image_input[]` | Exakte Pixel (`size: "custom"`, 1024–4096, Schritt 8, ≤16.8 MP) |
| pro | Imagen 4 Ultra | 0 / 0 | — | Ratio |
| ultra | Nano Banana 2 | 10 / 10 | `image_input[]` | Ratio |
| gptimage | GPT-Image-2 | 0 / 0 (Edits nur über `/v1/images/edits`) | — | Feste Presets 1024x1024 / 1536x1024 / 1024x1536 |
| flux | FLUX 1.1 Pro Ultra | 1 / 1 (ein Bild gesamt) | `image_prompt` | Ratio |
| ideogram | Ideogram v3 Turbo | 0 / 3 | `style_reference_images[]` | Ratio |
| recraft | Recraft v3 | 0 / 0 | — | Feste Pixel-Presets pro Ratio |
| qwen | Qwen Image | 1 / 0 | `image` | Ratio |

## Verhalten

- Referenzen an ein Modell ohne Referenz-Support → HTTP 400 `REFERENCE_NOT_SUPPORTED`
  (kein stilles Verwerfen, keine Abbuchung).
- Mehr Referenzen als erlaubt → HTTP 400 `REFERENCE_LIMIT_EXCEEDED`.
- Nicht unterstütztes Seitenverhältnis → nächstliegendes erlaubtes Verhältnis.
- Exakte Pixelgrößen werden nur bei `sizing.kind === 'exact'` gesendet, sonst ignoriert;
  Werte werden auf Range, Schrittweite und Megapixel-Budget geklemmt.

## UI

Die Zusatz-Slots für Referenzbilder erscheinen nur bei Modellen mit
`references.subject > 1`, die Pixel-Eingabe nur bei `sizing.kind === 'exact'`.
