

# Plan: Von ~91% auf 93-95% Loft-Film Qualität

## Problem-Analyse

### 1. Zahlen-Artefakte in Hintergründen
Die "Numbers-Only"-Regel in den Prompts sagt aktuell: "No letters, words, or writing — only numbers and digits are allowed." Das führt dazu, dass die KI Zahlen wie "6,773", "56%", "10.74%" in die Bilder einbaut. Die Regel muss geändert werden: KEINE Texte UND keine Zahlen.

### 2. SVG-Charakter-Stil-Gap
Die SVG-Charaktere (200x280 Viewbox, einfache Formen) wirken neben den hochdetaillierten illustrierten Hintergründen wie Fremdkörper. Zwei Optionen:
- **Option A**: SVG-Charaktere visuell aufwerten (mehr Details, Schattierung, proportionalere Körper)
- **Option B**: Charakter-Opacity/Größe reduzieren, damit sie weniger auffallen

Empfehlung: Option A — die Charaktere brauchen mehr visuelle Tiefe.

### 3. CTA-Szene zu unruhig
Der Hintergrund der CTA-Szene ist extrem bunt und detailliert. Lösung: CTA-Szenen-Prompt so anpassen, dass ein ruhigerer, fokussierterer Hintergrund generiert wird.

## Umsetzung

### Schritt 1: Zahlen-Artefakte eliminieren
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`
- Die "Numbers-Only"-Regel ändern zu: "This image must contain ZERO text, ZERO numbers, ZERO digits, ZERO percentages, ZERO labels."
- Auch in `supabase/functions/generate-premium-visual/index.ts` die NEGATIVE_PROMPT um "numbers, digits, percentages, statistics" erweitern

### Schritt 2: SVG-Charakter visuell aufwerten
**Datei:** `src/remotion/components/ProfessionalLottieCharacter.tsx` (ProfessionalSVGCharacter, ab Zeile 521)
- Viewbox von 200x280 auf 240x340 vergrößern für mehr Detail-Raum
- Körperproportionen verbessern: breitere Schultern, natürlichere Armansätze
- Mehr Schattierung: Innere Schatten auf Kleidung, Gesicht-Highlights
- Haare detaillierter: Mehrere Strähnen statt eine Form
- Kleidung-Details: Knöpfe, Kragen-Schatten, Falten-Andeutung
- Weichere Farbübergänge (mehr Gradient-Stops)

### Schritt 3: CTA-Hintergrund beruhigen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`
- Spezielle CTA-Szenen-Anweisung im Prompt: "CTA scenes should use a clean, minimal background with soft gradient or bokeh effect — no busy illustrations"

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/auto-generate-universal-video/index.ts` | Zahlen verbieten, CTA-Hintergrund beruhigen |
| `supabase/functions/generate-premium-visual/index.ts` | NEGATIVE_PROMPT erweitern |
| `src/remotion/components/ProfessionalLottieCharacter.tsx` | SVG-Charakter visuell aufwerten |

## Erwartetes Ergebnis
- Keine Zahlen-Artefakte mehr in Hintergründen
- Charaktere harmonieren visuell besser mit den Hintergründen
- CTA-Szene: klarer Fokus auf den Call-to-Action
- **Geschätzter Stand: ~93-95%**

## Hinweis
Nach den Änderungen muss das **Remotion Lambda Bundle erneut deployed werden** (r57), da die SVG-Charakter-Änderungen im Bundle leben.

