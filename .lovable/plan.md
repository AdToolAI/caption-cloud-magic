

## Plan: Export-Overlay mit Fortschrittsanzeige und UI-Sperre

### Problem
Nach Klick auf "Export" zeigt der Editor nur einen Toast "Export gestartet" — der Nutzer sieht keinen Fortschritt, kann weiter editieren, und weiß nicht wann das Video fertig ist.

### Lösung
Ein **fullscreen Render-Overlay** das über den gesamten Editor gelegt wird, sobald der Export startet. Es blockiert alle Bearbeitungsfunktionen und zeigt den Render-Fortschritt in Echtzeit.

### Was gebaut wird

**1. Neue Komponente: `RenderOverlay.tsx`**
- Fullscreen-Overlay (z-50) über dem gesamten Editor
- Animierter Fortschrittsbalken mit Prozentanzeige
- Status-Stufen: Vorbereitung → Rendering → Fertigstellung
- Geschätzte Restzeit basierend auf Fortschritt
- Bei Abschluss: Download-Button + "Zur Mediathek"-Button
- Bei Fehler: Fehlermeldung + Retry-Button
- Hintergrund leicht geblurred, Editor nicht klickbar

**2. Änderung: `CapCutEditor.tsx`**
- State hinzufügen: `isRendering`, `renderProgress`, `currentRenderId`, `renderedVideoUrl`, `renderComplete`, `renderError`
- Nach erfolgreichem Export-Aufruf: `render_id` aus Response speichern, Overlay anzeigen
- **Realtime-Subscription** auf `director_cut_renders` Tabelle (gleiche Logik wie ExportRenderStep)
- **Fallback-Polling** alle 30s via `check-remotion-progress` Edge Function
- Bei Abschluss: Video-URL anzeigen, Download ermöglichen
- Overlay blockiert alle Maus-Events auf den darunterliegenden Editor

### Technische Details

```text
┌─────────────────────────────────────────┐
│           RENDER OVERLAY (z-50)         │
│                                         │
│     🎬 Dein Video wird gerendert...     │
│                                         │
│     ████████████░░░░░░░░░  62%          │
│                                         │
│     Geschätzte Restzeit: ~2:30 Min      │
│                                         │
│  [Bei Fehler: Retry]  [Bei Fertig: ⬇]  │
└─────────────────────────────────────────┘
```

### Dateien

| Aktion | Datei | Beschreibung |
|--------|-------|--------------|
| Neu | `src/components/directors-cut/studio/RenderOverlay.tsx` | Overlay-Komponente mit Progress, Download, Fehler-Handling |
| Edit | `src/components/directors-cut/studio/CapCutEditor.tsx` | Render-State, Realtime-Subscription, Polling, Overlay einbinden |

### Reihenfolge
1. RenderOverlay-Komponente erstellen
2. CapCutEditor: Render-State + Realtime/Polling-Logik aus ExportRenderStep übernehmen
3. Overlay nach erfolgreichem Export-Aufruf anzeigen, Editor blockieren

