# Picture Studio: Referenzbilder & Pixelgrößen pro Modell sauber implementieren

## Ausgangslage (im Code geprüft)

`supabase/functions/generate-image-replicate/index.ts` setzt pro Tier unterschiedliche Felder, `src/config/pictureStudioModels.ts` kennt davon nur die Aspect-Ratios. Die UI bietet deshalb Referenz-Uploads auch bei Modellen an, die gar kein Bild entgegennehmen — der Upload verpufft still.

| Modell (Tier) | Referenzbilder heute | Feld | Pixelvorgabe heute |
| --- | --- | --- | --- |
| Standard – Gemini 2.5 Flash Image | 1 (Edit-Modus) | `image_url`-Block | nur Ratio |
| Fast – Seedream 4 | mehrere | `image_input[]` | fix `size: '2K'` |
| Pro – Imagen 4 Ultra | keine | – | nur Ratio |
| Ultra – Nano Banana 2 | mehrere | `image_input[]` | nur Ratio |
| GPT Image 2 | keine | – | 3 feste Größen |
| FLUX 1.1 Pro Ultra | 1 | `image_prompt` | nur Ratio |
| Ideogram v3 Turbo | mehrere (nur Stil) | `style_reference_images[]` | nur Ratio |
| Recraft v3 | keine | – | feste Größenliste |
| Qwen Image | 1 | `image` | nur Ratio |

Die UI schickt maximal zwei Bilder (`referenceImageUrl` = Motiv, `styleReferenceUrl` = Stil).

## Ziel

Für jedes Modell exakt das anbieten, was der Provider akzeptiert — nicht mehr, nicht weniger. Eine einzige Wahrheit, aus der UI und Edge Function lesen.

## Umsetzung

### 1. Fähigkeiten-Recherche pro Modell (Schritt 0, vor Code)

Pro Modell wird die Provider-Doku geprüft und in einer Matrix festgehalten (`docs/picture-model-capability-matrix.md`) mit Quelle:
Seedream 4, Nano Banana 2, Imagen 4 Ultra, FLUX 1.1 Pro Ultra, Ideogram v3 Turbo, Recraft v3, Qwen Image (alle Replicate), GPT-Image-2 und Gemini Flash Image (Lovable AI Gateway).
Erfasst wird je Modell: max. Anzahl Referenzbilder, Rolle der Referenz (Motiv / Stil / Maske), ob Ratio oder Pixel gesteuert wird, erlaubte Pixelbereiche bzw. Presets, Schrittweite und Megapixel-Deckel.

### 2. Registry erweitert (`src/config/pictureStudioModels.ts`)

`PictureModelCapability` bekommt:
- `references: { subject: number; style: number; field: 'image_input' | 'image_prompt' | 'image' | 'style_reference_images' | 'chat' | null }`
- `sizing: { kind: 'ratio' | 'preset' | 'exact'; presets?: Record<ratio, 'WxH'>; exact?: { minW, maxW, minH, maxH, step, maxMegapixels } }`

Die bisher doppelt gepflegten `ASPECT_SUPPORT`, `GPT_IMAGE_SIZES` und `RECRAFT_SIZES` in der Edge Function ziehen in eine geteilte Datei um (`supabase/functions/_shared/pictureModelCapabilities.ts`), aus der Client und Server dieselben Werte lesen.

### 3. Edge Function strikt an der Matrix ausrichten

`generate-image-replicate` baut den Input nicht mehr per if-Kette aus Annahmen, sondern aus der Capability-Definition:
- Referenzbilder werden auf `subject`/`style`-Kapazität gekappt und nur in das für dieses Modell erlaubte Feld geschrieben.
- Wird ein Referenzbild an ein Modell ohne Bildunterstützung geschickt, antwortet die Function mit einem klaren Fehlercode (`REFERENCE_NOT_SUPPORTED`) statt still zu ignorieren.
- Bei `sizing.kind === 'exact'` werden `width`/`height` durchgereicht (auf Step/Megapixel geklemmt), bei `preset` das Preset, sonst weiterhin `aspect_ratio`.

### 4. UI (`ImageGenerator.tsx`, Picture Studio)

- Referenz-Uploader nur sichtbar, wenn das aktive Modell Referenzen unterstützt; getrennte Slots für Motiv und Stil mit der jeweils erlaubten Anzahl, inklusive Multi-Upload dort, wo der Provider mehr als ein Bild erlaubt (Seedream, Nano Banana, Ideogram).
- Beim Modellwechsel: überzählige Bilder werden sichtbar entfernt statt still verworfen.
- Größenfeld modellabhängig: Ratio-Dropdown wie heute, Preset-Dropdown bei GPT-Image/Recraft, zusätzlich Breite/Höhe-Eingabe (mit Live-Validierung) bei Modellen mit `exact`.
- Kurzer Hinweistext pro Modell ("bis zu N Referenzbilder", "exakte Pixel möglich").

### 5. Absicherung

Vitest unter `src/config/__tests__/pictureModelCapabilities.test.ts`:
- Jedes Tier in der Registry existiert im geteilten Server-Modul mit identischen Werten.
- Jedes Modell mit `references.field === null` hat `subject = 0` und `style = 0`.
- Presets decken exakt die deklarierten Aspect-Ratios ab; `exact`-Grenzen sind plausibel (min < max, step > 0).

### 6. Verifikation vor Abschluss

Je ein echter Lauf pro Modell in der günstigsten Einstellung: einmal ohne Referenz, einmal mit der maximal erlaubten Anzahl Referenzbilder, einmal mit einer exakten Pixelgröße (wo unterstützt). Was der Provider ablehnt, wird in der Matrix korrigiert und in der UI gesperrt statt angeboten.

## Technische Details

Betroffen: `src/config/pictureStudioModels.ts`, neu `supabase/functions/_shared/pictureModelCapabilities.ts`, `supabase/functions/generate-image-replicate/index.ts`, `supabase/functions/generate-studio-image/index.ts` (nur Referenz-Handling des Standard-Tiers), `src/components/picture-studio/ImageGenerator.tsx`, neue Doku- und Testdatei.

Keine Änderung an Preisen, Wallet-/Credit-Logik, Video-Pipeline oder Lip-Sync.
