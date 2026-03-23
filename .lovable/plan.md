

# Plan: Filmart & Stil als eigenen Wizard-Schritt vor dem Interview

## Überblick
Neuer Schritt zwischen "Stimmung" (Step 1) und "Modus" (Step 2), in dem alle 20 visuellen Stile direkt auswählbar sind — aufgeteilt in **6 Filmarten** und **14 Stilrichtungen**. Die Frage nach dem visuellen Stil entfällt dann aus dem Interview.

## Aufteilung der 20 Stile

**6 Filmarten** (generative Stile, die die Bildästhetik grundlegend verändern):
- Comic, Cinematic, Documentary, Cartoon, Anime, Vintage-Retro

**14 Stilrichtungen** (Design-/Rendering-Stile):
- Flat Design, Isometric, Whiteboard, Corporate, Modern 3D, Minimalist, Bold Colorful, Hand-Drawn, Motion Graphics, Photo-Realistic, Watercolor, Neon Cyberpunk, Paper Cutout, Clay 3D

## Umsetzung

### 1. Neue Komponente `FilmStyleSelector.tsx`
Zwei visuelle Sektionen mit Karten-Grid:
- **Sektion 1: "Filmart"** — 6 große Karten mit Icon, Name, Beschreibung
- **Sektion 2: "Stilrichtung"** — 14 Karten im gleichen Format
- Nutzer wählt genau **eine** Option aus einer der beiden Sektionen (mutual exclusive)
- "Weiter"-Button nach Auswahl

### 2. Wizard-Schritte anpassen
**Datei:** `UniversalVideoWizard.tsx`

Neuer Step `visual-style` zwischen `mood` und `mode-select` einfügen:

```text
Vorher:  0-Category → 1-Mood → 2-ModeSelect → 3-Consultation → ...
Nachher: 0-Category → 1-Mood → 2-VisualStyle → 3-ModeSelect → 4-Consultation → ...
```

- `STEPS_FULL_SERVICE` und `STEPS_MANUAL` erweitern
- Alle Index-basierten Navigationsaufrufe (handleConsultationComplete → step 4→5, handleAutoGenerationComplete → step 5→6) um +1 verschieben
- `MoodConfig` um `visualStyle: UniversalVideoStyle` erweitern
- Neuer State `selectedVisualStyle` + Handler

### 3. Interview-Phase für Stil entfernen
Der Consultant fragt aktuell nach dem visuellen Stil (Phase ~18). Diese Frage wird übersprungen, da der Stil bereits gewählt ist. Der gewählte Stil wird stattdessen direkt ins `consultationResult.visualStyle` geschrieben.

### 4. Stil an Render-Pipeline durchreichen
`consultationResult.visualStyle` wird bereits heute an `auto-generate-universal-video` weitergegeben und dort für Prompt-Engineering genutzt — das bleibt unverändert, nur die Quelle wechselt von Interview-Antwort zu direkter UI-Auswahl.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/universal-video-creator/FilmStyleSelector.tsx` | **Neu** — Auswahl-UI mit 6 Filmarten + 14 Stilrichtungen |
| `src/components/universal-video-creator/UniversalVideoWizard.tsx` | Neuen Step einfügen, Indizes anpassen |
| `src/components/universal-video-creator/MoodPresetSelector.tsx` | `MoodConfig` um `visualStyle` erweitern |
| `src/components/universal-video-creator/index.ts` | Export hinzufügen |

## Erwartetes Ergebnis
- Nutzer wählt vor dem Interview visuell die Filmart oder Stilrichtung
- Interview fragt nicht mehr nach dem Stil
- Gewählter Stil fließt direkt in die Bildgenerierung

