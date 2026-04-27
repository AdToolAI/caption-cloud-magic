# KI Picture Studio – Phase 2 Roadmap

## Was ist heute schon da
- **Generieren-Tab**: 4 Quality-Tiers (Standard/Fast/Pro/Ultra mit Gemini, Seedream 4, Imagen 4 Ultra, Nano Banana 2), 21 Stile, 7 Aspect Ratios, Image-to-Image mit Reference Upload, Auto-Save in System-Album.
- **Smart Background-Tab**: Background Removal/Replacement.
- **Wallet-Integration**: €-Credits + Insufficient-Credits Flow.

## Was im Vergleich zu Artlist / Midjourney / Firefly / Magnific noch fehlt

Hier die **6 wichtigsten Features**, sortiert nach Impact-pro-Aufwand:

### 1. AI Upscaler (4K / 8K) — *highest impact*
Generierte Bilder werden meist in 1024–2048px geliefert. Für Print, Ads und große Displays braucht es 4K+. Konkurrenz: Magnific, Topaz Gigapixel, Firefly „Enhance".
- **Modell**: `philz1337x/clarity-upscaler` oder `nightmareai/real-esrgan` via Replicate
- **UI**: „Upscale 2x / 4x"-Button im ImageCard-Hover und im StudioLightbox
- **Kosten**: ~$0.05/Bild (Pass-through ins €-Wallet)

### 2. Variations (4 Bilder pro Prompt) — *Midjourney-Killer-Feature*
Aktuell wird **1 Bild pro Generation** erzeugt. Midjourney/Firefly liefern standardmäßig 4 Varianten zur Auswahl.
- Toggle „1 / 4 Variants" im Generator
- Bei 4 Varianten parallele Promise.all-Requests an dieselbe Edge-Function
- Grid-Anzeige mit „Verfeinern"-Button pro Variante (re-rolls mit gleichem Seed + leichter Prompt-Variation)

### 3. Inpainting / Outpainting (Magic Edit)
Teile eines Bildes mit Maske ersetzen oder Canvas erweitern. Konkurrenz: Photoshop Generative Fill, Firefly, Ideogram Magic Fill.
- Neuer Tab **„Magic Edit"** im Picture Studio
- Canvas-Editor mit Brush-Tool für Maske
- Outpainting: Aspect-Ratio-Switcher erweitert das Canvas und füllt mit AI
- **Modell**: `black-forest-labs/flux-fill-pro` oder Gemini Nano Banana Edit-Mode
- Reuse von vorhandener `background-projects` Storage-Bucket

### 4. Style-Transfer & Reference-Style-Lock
Bild + „Mach es im Stil von <Reference>". Heute existiert nur Image-to-Image (1 Reference), aber kein **Style-Reference-System** wie Midjourney `--sref`.
- 2-Slot-System: „Subject Reference" + „Style Reference"
- Optional: Brand-Kit Style Lock — Nutzer speichert eine Reference dauerhaft als „Markenstil", wird auto-injected
- **Modell**: Nano Banana 2 Multi-Image-Edit oder `black-forest-labs/flux-redux`

### 5. Batch-Generation aus Prompt-Liste
Mehrere Prompts auf einmal durchlaufen lassen (z. B. 10 Produktbilder für E-Commerce / Ad-Carousel).
- CSV-Upload oder Multi-Line-Textarea („1 Prompt pro Zeile")
- Queue-System mit Progress-Bar und Cost-Preview *vor* Start
- Reuse `useRenderQueue` / `useBatchVideoCreation` Pattern

### 6. Brand-Kit Auto-Apply (CI-Treue)
Es existiert bereits `useBrandKitAutoApply` und `analyze-image-v2` mit CI-Color-Match. Aktuell wird das im Picture Studio **nicht** genutzt.
- Toggle „Brand-Kit aktiv" im Generator
- Auto-Inject von Brand-Farben + Font-Hinweisen ins Prompt
- Nach Generation: ImageAnalysisPanel mit CI-Match-Score (0–100%)
- Warnung wenn Score < 60%

---

## Empfohlene Reihenfolge (3 Phasen)

```text
Phase A (sofort, ~1 Lovable-Loop):
  1. AI Upscaler 2x/4x  ← schneller Win, sofort wertvoll
  2. Variations 1/4     ← User-Experience-Boost

Phase B (~1 Loop):
  3. Magic Edit (Inpaint + Outpaint Canvas-Tab)

Phase C (~1 Loop):
  4. Style-Reference 2-Slot
  5. Batch-Generation
  6. Brand-Kit Lock + CI-Score
```

## Technische Details (für Phase A)

**Edge Functions (neu):**
- `upscale-image` — Replicate `clarity-upscaler`, akzeptiert `imageId` oder `imageUrl`, Wallet-Debit, Storage-Save in `background-projects/{user_id}/upscaled/`
- `generate-image-variations` — Wrapper, der `generate-image-replicate` n-mal parallel aufruft, gemeinsame Wallet-Reservation

**Frontend (Phase A):**
- `ImageCard.tsx` → neuer Hover-Button „Upscale" mit Dropdown 2x/4x
- `StudioLightbox.tsx` → „Upscale & Download"-Action
- `ImageGenerator.tsx` → Switch „4 Varianten generieren" (4× Cost-Preview + 4× parallel)
- Neuer State `upscalingImageId` für Spinner-Overlay

**Wallet-Logik:**
- Upscale 2x: $0.03  /  4x: $0.06
- Variations: Cost × 4, Pre-Check `balance >= cost*4`

**DB:**
- `studio_images.parent_id` (uuid, nullable) → Verknüpfung Variante↔Original und Upscale↔Original
- `studio_images.upscale_factor` (int, nullable)

---

## Was ich NICHT vorschlage
- **Eigenes Model-Training (LoRA/DreamBooth)** — zu komplex, zu teuer pro User, geringe Adoption
- **3D-Generation** — kein Marketing-Use-Case, hohe Kosten
- **Video-aus-Bild im Picture Studio** — gehört in AI Video Studio (existiert bereits)

---

## Frage an dich
Welche Phase starten wir? **Empfehlung: Phase A (Upscaler + Variations)** — höchster sofort spürbarer Mehrwert, ~1 Loop Aufwand, beide Features sind „Killer-Demos" in jedem Sales-Pitch.