

# Plan: Video-Stimmungs-Presets + Schwarze-Szenen-Fix

## Problem-Analyse

**Schwarze Szenen (erste + letzte):** Die `generatePNGPlaceholder` Funktion erstellt ein 1x1 PNG und lädt es in den Storage. Wenn das fehlschlägt, fällt es auf `placehold.co` zurück. Das Problem: Wenn `generate-premium-visual` für die erste und letzte Szene scheitert (Hook + CTA sind oft schwieriger zu generieren) UND der PNG-Upload auch fehlschlägt, wird `GradientFallback` (dunkles Navy `#0f172a`) angezeigt — was schwarz aussieht. Außerdem: Das 1x1 PNG hat keine visuellen Informationen, und bei Renderfehlern zeigt die `<Img>` Komponente nichts.

**Fehlende kreative Steuerung:** Aktuell wählt der User nur eine Kategorie (z.B. "Advertisement") und geht direkt in die 22-Phasen-Beratung. Es gibt keine Möglichkeit, vorab die visuelle Richtung/Stimmung einzustellen.

---

## Lösung: 2 Teile

### Teil 1: Stimmungs-Preset-System (neuer Wizard-Step)

Neuer Step zwischen Kategorie-Auswahl und Modus-Auswahl: **"Stimmung & Stil"**

**Presets pro Stimmung:**

| Preset | Text-Dichte | Farb-Stimmung | Tempo | Musik-Stil |
|---|---|---|---|---|
| **Energetisch** | Wenig Text, große Headlines | Neon, kräftig | Schnell | Upbeat |
| **Professionell** | Mittel, strukturiert | Gedämpft, Business | Mittel | Corporate |
| **Emotional** | Viel Text, Storytelling | Warm, golden | Langsam | Cinematic |
| **Minimalistisch** | Sehr wenig, nur Keywords | Schwarz/Weiß + Akzent | Langsam | Ambient |
| **Verspielt** | Mittel, mit Emojis | Bunt, Pastell | Schnell | Fun/Pop |

**Zusätzliche Einstellungen (Slider/Toggles):**
- Text-Menge: Wenig / Mittel / Viel
- Animations-Intensität: Subtil / Normal / Dynamisch  
- Szenen-Badges anzeigen: Ja/Nein

Diese Werte fließen in `UniversalConsultationResult` ein und werden an `auto-generate-universal-video` + `generate-universal-script` weitergegeben, wo sie die Prompt-Generierung und Layout-Konfiguration steuern.

**Neue Datei:** `src/components/universal-video-creator/MoodPresetSelector.tsx`

**Änderungen an:** `UniversalVideoWizard.tsx` (neuer Step), `UniversalConsultationResult` Type (neue Felder), `auto-generate-universal-video/index.ts` (Presets auswerten), `generate-universal-script/index.ts` (Prompt anpassen)

### Teil 2: Schwarze-Szenen-Fix

**Root Cause Fix:** Die `generatePNGPlaceholder` Funktion erstellt ein 1x1 PNG das visuell wertlos ist. Und wenn der Storage-Upload fehlschlägt, ist das `placehold.co` Fallback potenziell nicht erreichbar von Lambda.

**Fixes:**
1. **Größeres Fallback-Bild:** Statt 1x1 PNG → `placehold.co` URL direkt verwenden (verlässlich, echte Farben) ODER einen Canvas-basierten Gradient generieren
2. **Gradient-Fallback verbessern:** `GradientFallback` soll die Brand-Colors nutzen statt hartes Navy/Schwarz. Dazu `brandColors` als Props an `SceneBackground` → `GradientFallback` durchreichen
3. **Hook/CTA-Szenen priorisieren:** Diese als eigenen Batch ZUERST generieren mit mehr Retries (5 statt 3), da sie die wichtigsten sind

### Dateien die geändert werden

| Datei | Änderung |
|---|---|
| `src/components/universal-video-creator/MoodPresetSelector.tsx` | **Neu** — Stimmungs-Preset-Auswahl mit visuellen Karten + Slidern |
| `src/components/universal-video-creator/UniversalVideoWizard.tsx` | Neuen Step "Stimmung" einfügen, Preset-Daten in State speichern und an Consultant/Generator weitergeben |
| `src/types/universal-video-creator.ts` | `MoodPreset` Type + neue Felder in `UniversalConsultationResult` |
| `supabase/functions/auto-generate-universal-video/index.ts` | Preset-Daten auswerten, Gradient-Fallback verbessern (Brand-Colors), Hook/CTA-Szenen priorisieren |
| `supabase/functions/generate-universal-script/index.ts` | Stimmungs-Preset in Prompt integrieren (Text-Dichte, Tempo etc.) |
| `src/remotion/templates/UniversalCreatorVideo.tsx` | `GradientFallback` Brand-Colors-aware machen, `showSceneTitles` dynamisch aus Preset |

