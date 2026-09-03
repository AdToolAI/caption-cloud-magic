# Picture Studio — Modell-Fähigkeitsmatrix

Einzige Quelle der Wahrheit: `supabase/functions/_shared/pictureModelCapabilities.ts`.
`src/config/pictureModelCapabilities.ts` re-exportiert diese Datei, damit UI und
Edge Functions nicht auseinanderlaufen können. Paritätstests:
`src/config/__tests__/pictureModelCapabilities.test.ts`.

| Tier | Modell | Referenzen (Motiv / Stil) | Request-Feld | Größensteuerung |
| --- | --- | --- | --- | --- |
| standard | Gemini Image | 3 / 1, max. 4 gesamt | Chat `image_url`-Blöcke | Ratio (Prompt) |
| fast | Seedream 4 | 10 / 10, max. 10 gesamt | `image_input[]` | 1K / 2K / 4K / Custom; Custom 1024–4096, Schritt 8, ≤16.8 MP |
| pro | Imagen 4 Ultra | 0 / 0 | — | Ratio + 1K / 2K |
| ultra | Nano Banana (`google/nano-banana`) | 10 / 10, max. 10 gesamt | `image_input[]` | Ratio |
| gptimage | GPT-Image-2 | 4 / 0 | Multipart `image[]` über `/v1/images/edits` | Feste Presets 1024x1024 / 1536x1024 / 1024x1536 |
| flux | FLUX 1.1 Pro Ultra | 1 / 1 (ein Bild gesamt) | `image_prompt` | Ratio |
| ideogram | Ideogram v3 Turbo | 0 / 3 | `style_reference_images[]` | Ratio oder Provider-Auflösung |
| recraft | Recraft v3 | 0 / 0 | — | Feste Pixel-Presets pro Ratio |
| qwen | Qwen Image | 1 / 0 | `image` | Ratio + Qualität/Geschwindigkeit |

Nicht unterstützte Modi werden pro Modell deaktiviert. `Reference mix` erscheint nur bei Endpoints mit mehreren Motiv-Referenzen. FLUX und Qwen erhalten im Transform-Modus die provider-native Referenzstärke.

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
