

# Phase 9+10: Visual Prompt Engineering & Cinematic Post-Production

## Aktueller Stand

Die Pipeline hat bereits:
- **Negative Prompts** in `generate-premium-visual` (NEGATIVE_PROMPT + `sanitizePrompt()`)
- **CategoryContrastOverlay** mit 5 Typen (cinematic, bold, subtle, clean, dramatic) in `UniversalCreatorVideo.tsx`
- **SVG Filters** inkl. Film Grain, Bleach Bypass, Vignette in `SVGFilters.tsx`
- **Saturation Filter** (`saturate(1.15)`) bereits als Memory dokumentiert

Was **fehlt** fuer Loft-Film-Qualitaet:

---

## Phase 9: Visual Prompt Engineering

**Ziel:** QR-Codes, generische Logos, UI-Elemente und Artefakte aus KI-Bildern eliminieren.

### Aenderungen

| Datei | Was |
|-------|-----|
| `generate-premium-visual/index.ts` | Erweiterte NEGATIVE_PROMPT + sanitizePrompt |
| `auto-generate-universal-video/index.ts` | Prompt-Template verschaerfen |

**Details:**
1. `NEGATIVE_PROMPT` erweitern um: `QR code, barcode, logo, brand mark, icon overlay, UI element, button, screenshot, phone mockup, laptop screen, website screenshot, app interface, stock photo watermark, shutterstock, getty`
2. `sanitizePrompt()` um Regex fuer QR/Logo-Begriffe erweitern
3. In `auto-generate-universal-video` den Scene-Prompt mit explizitem `NO QR codes, NO logos, NO UI mockups, NO screenshots` anreichern — besonders fuer `feature` und `solution` Szenen wo diese Artefakte am haeufigsten auftreten

---

## Phase 10: Cinematic Post-Production Layer

**Ziel:** Automatische cinematische Overlays pro Szene im Universal Video — Film Grain, Vignette, Color Grading — ohne manuellen Director's Cut.

### Aenderungen

| Datei | Was |
|-------|-----|
| `UniversalCreatorVideo.tsx` | `CinematicPostLayer` Komponente hinzufuegen |
| `auto-generate-universal-video/index.ts` | `cinematicProfile` pro Kategorie in inputProps |

**Details:**

1. **Neue `CinematicPostLayer` Komponente** in `UniversalCreatorVideo.tsx`:
   - Kombiniert 3 Effekte als CSS-Overlays (kein SVG noetig = Lambda-kompatibel):
     - **Film Grain**: Pseudo-Element mit `noise` Background + Opacity 3-6% + `mix-blend-mode: overlay`
     - **Vignette**: Radial-Gradient Overlay (bereits in CategoryContrastOverlay vorhanden, wird verstaerkt)
     - **Color Grading**: CSS Filter-Kette pro Mood (`warm`, `cool`, `neutral`, `dramatic`)
   - Wird **nach** CategoryContrastOverlay aber **vor** Text/Character-Overlays eingefuegt

2. **Cinematic Profile Mapping** (Edge Function):
```text
advertisement  → warm grading, medium grain, strong vignette
storytelling   → warm grading, heavy grain, cinematic vignette  
tutorial       → neutral grading, no grain, light vignette
corporate      → cool grading, light grain, subtle vignette
testimonial    → warm grading, medium grain, cinematic vignette
product-video  → neutral grading, no grain, dramatic vignette
social-content → bold grading, no grain, no vignette
```

3. **Color Grading CSS-Filter pro Mood**:
```text
warm:     saturate(1.15) sepia(0.08) brightness(1.02)
cool:     saturate(1.1) hue-rotate(-5deg) brightness(0.98)
neutral:  saturate(1.05) contrast(1.05)
dramatic: saturate(1.2) contrast(1.15) brightness(0.95)
bold:     saturate(1.3) contrast(1.2) brightness(1.05)
```

4. **Film Grain als animiertes CSS** (kein statisches Bild noetig):
   - CSS `background-image` mit kleinem Noise-Pattern als Base64-encoded 4x4px PNG
   - `opacity: 0.04` + `mix-blend-mode: overlay`
   - Animiert via Remotion-Frame fuer subtile Variation

---

## Zusammenfassung

- **Phase 9**: 2 Edge Functions anpassen (Prompt-Haertung)
- **Phase 10**: 1 Remotion-Komponente + 1 Edge Function (cinematische Overlays)
- **Kein S3-Bundle-Redeploy** fuer Phase 9, **S3-Redeploy noetig** fuer Phase 10 (Remotion-Aenderung)
- Geschaetzte Umsetzung: ~15-20 Minuten

