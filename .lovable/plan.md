

## Status-Check: Director's Cut Studio

### Was bereits funktioniert ✓

1. **Import → Studio Flow** — Video-Import führt direkt in den CapCut-Editor, kein 11-Schritt-Wizard mehr
2. **8 Sidebar-Tabs** — Cut, Look, FX, Media, Text, Audio, Export, Settings sind alle integriert und verdrahtet
3. **CutPanel** — Split am Playhead, Szenen löschen, duplizieren, Auto-Cut (KI-Analyse optional)
4. **LookPanel** — Style-Presets, Farbkorrektur, Filter auf einer Seite
5. **FXPanel** — Chroma Key, Upscaling, Interpolation, Restoration
6. **ExportPanel** — Render-Einstellungen in der Sidebar
7. **Scene Management** — Split, Delete, Duplicate, Reorder via Drag & Drop auf Timeline
8. **Audio/Subtitle/Text** — Bestehende Features funktionieren weiter
9. **Draft-Speicherung** — Auto-Save/Restore in sessionStorage

### Potenzielle Verbesserungspunkte

**1. Export-Button führt ins Nichts**
Der Export-Button in der Sidebar ruft `onExportClick` auf, was auf `onNextStep` gemappt ist. Da der Stepper entfernt wurde, fehlt der tatsächliche Render-/Download-Flow. Der Button sollte den Export direkt auslösen (Edge Function `director-cut-render`).

**2. Voice-Over Tab fehlt in der Sidebar**
Im Plan war ein separater "Voice" Tab vorgesehen. Aktuell gibt es keinen dedizierten Voice-Tab — Voice-Over-Generierung ist nur über den alten Audio-Tab erreichbar, was versteckt wirkt.

**3. Kein "Zurück zum Import" Button im Studio**
`onBackToImport` wird als Prop durchgereicht, aber es gibt keinen sichtbaren Button im Editor-UI, der diese Funktion aufruft. Nutzer sitzen im Studio fest.

**4. Reset-Button nicht vollständig verdrahtet**
`onResetProject` wird als Prop übergeben, aber der Reset-Button in der Settings-Sidebar ruft nur `handleAudioEffectsChange(DEFAULT_AUDIO_EFFECTS)` auf — nicht den echten Projekt-Reset.

### Vorgeschlagene Fixes

| Fix | Datei | Aufwand |
|-----|-------|---------|
| Export-Button → echten Render-Flow auslösen | `CapCutEditor.tsx`, `ExportPanel.tsx` | Mittel |
| "Zurück"-Button im Header sichtbar machen | `CapCutEditor.tsx` (Header-Bar) | Klein |
| Reset-Button korrekt verdrahten | `CapCutEditor.tsx` (Sidebar-Props) | Klein |
| Voice-Over als eigenen Tab oder klarer im Audio-Tab platzieren | `CapCutSidebar.tsx` | Klein |

### Empfehlung

Die **Grundarchitektur funktioniert**. Die 4 Fixes oben sind kleine Verdrahtungs-Korrekturen, die den Studio-Flow abrunden. Am wichtigsten ist der **Export-Flow**, damit Nutzer tatsächlich ein fertiges Video herunterladen können.

