

## Plan: Render-Fortschritt korrekt tracken — richtige Edge Function + Completion-Screen

### Problem

1. **Falsche Edge Function**: Der Client pollt `check-render-status`, die nur `video_renders` abfragt. Director's Cut Renders liegen in `director_cut_renders` → jeder Poll schlägt mit "Unauthorized" fehl → Fortschritt bleibt bei 10%
2. **Falscher Render-ID**: Der Client nutzt `render_id` (DB-UUID), aber `check-remotion-progress` braucht die `remotion_render_id`
3. **Kein Abschluss-Feedback**: Overlay verschwindet still, ohne Erfolg/Download anzuzeigen

### Lösung

Polling auf `check-remotion-progress` umstellen (die bereits Director's Cut korrekt unterstützt) und `remotion_render_id` verwenden.

### Änderung

**Datei: `src/components/directors-cut/studio/CapCutEditor.tsx`**

**1. Response-Handling (~Zeile 1072)**
- Zusätzlich `remotion_render_id` aus der Response extrahieren und speichern

**2. Polling-Funktion (`startRenderPolling`, ~Zeile 981)**
- Edge Function von `check-render-status` auf `check-remotion-progress` ändern
- Body: `{ renderId: remotionRenderId, source: 'directors-cut' }` statt `{ renderId }`
- Response-Mapping anpassen:
  - `data.progress?.done` → completed
  - `data.progress?.outputFile` → video URL
  - `data.progress?.overallProgress` → Fortschritt (0-1, mal 100)
  - `data.progress?.fatalErrorEncountered` → failed
- Polling-Intervall: 10s statt 15s für schnelleres Feedback

**3. Completion-Handling**
- Bei `done: true` → `setRenderProgress(100)`, `setRenderStatus('completed')`, `setRenderedVideoUrl(outputFile)`
- Overlay bleibt sichtbar mit Download-Button und "Video fertig!" Anzeige
- Polling-Cleanup im `useEffect`-Cleanup sicherstellen

### Ergebnis

Fortschrittsbalken zeigt echten Render-Fortschritt (0-100%), Overlay bleibt bis zum Abschluss sichtbar, und der Nutzer sieht "Video fertig!" mit Download-Button.

