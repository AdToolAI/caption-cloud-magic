

## Plan: Director's Cut → Single-Page Studio (CapCut-Stil, modernisiert)

### Problem

1. **KI-Analyse unzuverlässig** — Szenen werden falsch erkannt, Nutzer hat keine Kontrolle
2. **11 Schritte zu fragmentiert** — Filter/Style/Farbe/VFX/Motion redundant über 4 separate Seiten
3. **Übergangsprobleme** — weil Szenen-Grenzen von fehlerhafter KI kommen
4. **Unprofessionell** — gleiches Feature an mehreren Stellen änderbar

### Lösung: Alles in einem CapCut-Studio

Der bestehende CapCut-Editor (aktuell nur Schritt 10) wird zur **einzigen Oberfläche**. Die 11 Schritte werden zu **Sidebar-Tabs** komprimiert. Die KI-Analyse wird optional — Nutzer können Szenen-Grenzen manuell auf der Timeline setzen.

```text
┌─────────────────────────────────────────────────────────────┐
│  Header: Projekt-Name  |  Undo/Redo  |  Export-Button       │
├──────────┬──────────────────────────────┬───────────────────┤
│ SIDEBAR  │       VIDEO PREVIEW          │  PROPERTIES       │
│          │                              │  (kontextabhängig) │
│ 📁 Media │    ┌────────────────────┐    │                   │
│ ✂ Cut    │    │                    │    │  Wenn Szene:      │
│ 🎨 Look  │    │   Video Player     │    │  - Duration       │
│ 🎵 Audio │    │                    │    │  - Transition     │
│ 🎤 Voice │    └────────────────────┘    │  - Speed          │
│ 📝 Text  │                              │                   │
│ ⚡ FX    │                              │  Wenn Clip:       │
│ 📤 Export│                              │  - Volume/Fade    │
│          │                              │                   │
├──────────┴──────────────────────────────┴───────────────────┤
│  TIMELINE                                                    │
│  [Video] ▓▓▓▓▓▓│▓▓▓▓▓▓▓│▓▓▓▓▓│▓▓▓▓▓▓▓  ← Szenen manuell  │
│  [Audio] ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                      │
│  [Voice] ░░░░░░░░░░░░░░                                     │
│  [Subs]  ████ ████ ████ ████                                 │
└─────────────────────────────────────────────────────────────┘
```

### Sidebar-Tabs (statt 11 Schritte)

| Tab | Inhalt | Ersetzt Schritte |
|-----|--------|-----------------|
| **Media** | Video importieren, Mediathek-Assets, Szene hinzufügen | 1 (Import) |
| **Cut** | Manuell Szenen-Grenzen setzen, Split, Delete, Reorder. Optional: KI-Analyse als "Auto-Cut" Button | 2+3 (Analyse + Szenen) |
| **Look** | Style-Presets, Farbkorrektur, Filter — alles auf einer Seite | 4+5 (Style + Farbe) |
| **FX** | Chroma Key, Speed, Ken Burns, Text-Overlays, Qualität | 6+7+8 (VFX + Motion + Qualität) |
| **Audio** | Musik, Sound-Effekte, Audio-Mixing (bestehende Sidebar) | 9+10 (Audio) |
| **Voice** | KI Voice-Over generieren | 9 (Voice) |
| **Text** | Untertitel, Text-Overlays (bestehende Sidebar) | Teil von 10 |
| **Export** | Render-Einstellungen, Format, Qualität | 11 (Export) |

### Manuelle Szenen-Erstellung (statt KI)

Auf der Timeline:
- **Klick auf Video-Track** → setzt einen Split-Marker
- **"Szene teilen" Button** oder Tastenkürzel `S` → splittet am Playhead
- **Optional**: "Auto-Cut" Button in der Cut-Sidebar → ruft die KI-Analyse auf (für Nutzer die es wollen)
- **Drag an Szenen-Rändern** → Trim In/Out
- **Drag Szenen** → Reihenfolge ändern
- **Rechtsklick/Delete** → Szene entfernen
- **Übergänge**: Klick zwischen zwei Szenen → Transition-Picker Popup

### Was passiert mit bestehendem Code

| Bestehend | Aktion |
|-----------|--------|
| `CapCutEditor.tsx` (1439 Zeilen) | Wird zur **Haupt-Komponente** — erweitert um Look/FX/Cut Tabs |
| `CapCutSidebar.tsx` (1599 Zeilen) | Bekommt neue Tab-Sektionen: Cut, Look, FX |
| `CapCutTimeline.tsx` | Bekommt manuelle Split/Trim-Funktionalität auf dem Video-Track |
| `DirectorsCut.tsx` | Stark vereinfacht — nur noch Import-Screen + dann sofort Studio |
| `SceneEditingStep.tsx` | Logik (Split, Delete, Reorder) → in CapCutTimeline integriert |
| `StyleLookStep.tsx` | UI → in Sidebar "Look" Tab |
| `ColorCorrectionStep.tsx` | UI → in Sidebar "Look" Tab |
| `SpecialEffectsStep.tsx` | UI → in Sidebar "FX" Tab |
| `MotionEffectsStep.tsx` | UI → in Sidebar "FX" Tab |
| `QualityEnhancementStep.tsx` | UI → in Sidebar "FX" Tab |
| `SceneAnalysisStep.tsx` | Wird zu "Auto-Cut" Button in Cut-Tab |
| `VoiceOverStep.tsx` | UI → in Sidebar "Voice" Tab |
| `ExportRenderStep.tsx` | UI → in Sidebar "Export" Tab |

### Neuer Flow

```text
1. Video importieren (Mediathek oder Upload)
2. → Sofort im Studio-Editor
3. Nutzer arbeitet frei: schneiden, stylen, Audio — in beliebiger Reihenfolge
4. Export wenn fertig
```

### Dateien

| Aktion | Datei |
|--------|-------|
| **Stark editieren** | `src/pages/DirectorsCut/DirectorsCut.tsx` — 11-Step-Stepper entfernen, nach Import direkt Studio |
| **Stark editieren** | `src/components/directors-cut/studio/CapCutSidebar.tsx` — Neue Tabs: Cut, Look, FX, Voice, Export |
| **Editieren** | `src/components/directors-cut/studio/CapCutTimeline.tsx` — Manueller Split am Playhead, Trim-Handles |
| **Editieren** | `src/components/directors-cut/studio/CapCutEditor.tsx` — Alle Effekt-States aufnehmen |
| **Neu** | `src/components/directors-cut/studio/sidebar/CutPanel.tsx` — Szenen-Management + Auto-Cut |
| **Neu** | `src/components/directors-cut/studio/sidebar/LookPanel.tsx` — Style + Farbe kombiniert |
| **Neu** | `src/components/directors-cut/studio/sidebar/FXPanel.tsx` — VFX + Motion + Qualität |
| **Neu** | `src/components/directors-cut/studio/sidebar/ExportPanel.tsx` — Render-Settings |

### Design

Gleicher James Bond 2028 Stil wie der bestehende CapCut-Editor:
- `backdrop-blur-xl bg-card/60 border border-white/10`
- Framer Motion Animationen
- Dark Theme optimiert für Video-Editing
- Sidebar-Tabs als vertikale Icon-Leiste (wie CapCut/DaVinci)

### Reihenfolge (über mehrere Nachrichten)

1. **DirectorsCut.tsx** vereinfachen: Import → sofort CapCutEditor
2. **CutPanel** erstellen: Manuelles Szenen-Splitting + optionaler Auto-Cut
3. **CapCutTimeline** erweitern: Split am Playhead, Trim-Handles auf Video-Track
4. **LookPanel** erstellen: Style-Presets + Color Grading zusammen
5. **FXPanel** erstellen: Chroma Key, Speed, Ken Burns, Qualität
6. **ExportPanel** erstellen: Render-Settings in der Sidebar
7. **CapCutSidebar** + **CapCutEditor** aktualisieren: Neue Tabs einbinden, States durchreichen

### Ergebnis

Statt 11 Seiten durchzuklicken → **eine Oberfläche**, alles sofort erreichbar. Szenen werden manuell auf der Timeline gesetzt (kinderleicht), KI-Analyse nur optional. Keine doppelten Filter-Einstellungen mehr.

