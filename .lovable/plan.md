

## Smart Background v3 — Intelligenter, Hochwertiger, Visuell Beeindruckender

### Uebersicht
Drei Saeulen: (1) KI-Produkterkennung fuer automatische Kategorie/Lighting-Empfehlung, (2) besseres Bildmodell + verfeinerte Prompts fuer hoehere Qualitaet, (3) komplett neues UI-Design mit Glassmorphismus, Before/After-Slider und immersiver Galerie.

---

### Aenderungen

#### 1. Edge Function `generate-background-scenes/index.ts` — Intelligenz + Qualitaet

- **Produktanalyse-Schritt**: Vor der Szenen-Generierung das hochgeladene Produktbild per Lovable AI (gemini-3-flash-preview, Text-only) analysieren lassen: Produkttyp erkennen, beste Kategorie + Lighting + Style Intensity automatisch vorschlagen
- **Modell-Upgrade**: Von `google/gemini-2.5-flash-image-preview` auf `google/gemini-3.1-flash-image-preview` (Nano Banana 2) — schneller + hoehere Qualitaet
- **Verbesserte Prompts**: Detailliertere Compositing-Anweisungen mit Reflexions-Mapping, Schatten-Konsistenz und Farbtemperatur-Matching
- **Echte Qualitaetsbewertung**: Nach Generierung das Ergebnis per Text-AI bewerten lassen (Compositing-Score, Schatten, Farb-Harmonie) statt Zufallswerte

#### 2. `src/pages/BackgroundReplacer.tsx` — Intelligente Auto-Konfiguration

- Neuer State `aiSuggestion` mit Produkttyp, empfohlener Kategorie, Lighting, Intensity
- Nach Background-Removal automatisch `analyze-product` Logik ausfuehren (im gleichen Edge Function oder separater Call)
- "KI-Empfehlung uebernehmen" Button der alle Einstellungen auf einmal setzt
- Animierter Insight-Banner der die Empfehlung anzeigt (z.B. "Erkannt: Kopfhoerer → Empfohlen: Tech + Dramatic Lighting")

#### 3. `src/components/background/BackgroundReplacerHeroHeader.tsx` — Next Level Design

- Animierte Partikel im Hintergrund (schwebende Lichtpunkte wie auf den Hub-Seiten)
- Shimmer-Border um den Hero-Bereich
- Badge-Upgrade auf "v3" mit pulsierendem Glow
- Untertitel: "KI-Produkterkennung · Pro Compositing · Nano Banana 2"

#### 4. `src/components/background/SceneGallery.tsx` — Immersive Galerie

- Glassmorphismus-Cards mit Neon-Glow bei Hover (passend zum James Bond 2028 Theme)
- Klick auf Bild oeffnet Fullscreen-Lightbox mit Before/After Vergleich (Original vs. generiert)
- Qualitaets-Badge mit farbigem Glow (Gruen/Gold/Rot)
- Staggered Framer Motion Eingangs-Animation
- Masonry-aehnliches Layout statt starrem Grid

#### 5. `src/components/background/ExportControls.tsx` — Premium Export-Bar

- Glassmorphismus-Leiste mit Gradient-Buttons
- Hover-Shimmer-Effekte auf den Buttons

#### 6. Neue Komponente `src/components/background/ProductInsightBanner.tsx`

- Zeigt KI-Produkterkennung an: Produkttyp-Icon, empfohlene Einstellungen
- Animierter Eintritt mit Framer Motion
- "Uebernehmen" Button der Kategorie, Lighting und Intensity auf einmal setzt
- Glassmorphismus-Card mit Cyan-Glow

#### 7. Neue Komponente `src/components/background/ImageLightbox.tsx`

- Fullscreen Overlay mit Backdrop-Blur
- Before/After Slider (Drag-Handle in der Mitte)
- Zeigt Original-Cutout vs. generiertes Ergebnis
- Metadaten-Panel (Scene, Camera, Quality Scores)
- ESC zum Schliessen

### Technische Details

- Produktanalyse nutzt Tool-Calling fuer strukturierte Ausgabe: `{ productType, suggestedCategory, suggestedLighting, suggestedIntensity, reasoning }`
- Qualitaetsbewertung per separatem AI-Call nach jeder Generierung (Text-Modell bewertet das generierte Bild)
- Before/After Slider per CSS clip-path + Drag-Event

### Dateien
1. `supabase/functions/generate-background-scenes/index.ts` — Modell-Upgrade + Produktanalyse + echte Qualitaetsbewertung
2. `src/pages/BackgroundReplacer.tsx` — Auto-Konfiguration + Insight-Integration
3. `src/components/background/BackgroundReplacerHeroHeader.tsx` — Partikel + v3 Badge
4. `src/components/background/SceneGallery.tsx` — Glassmorphismus + Lightbox-Trigger + Animationen
5. `src/components/background/ExportControls.tsx` — Premium Design
6. `src/components/background/ProductInsightBanner.tsx` — NEU: KI-Empfehlungs-Banner
7. `src/components/background/ImageLightbox.tsx` — NEU: Fullscreen Before/After

