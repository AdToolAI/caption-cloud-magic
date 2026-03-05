

## Diagnose

Der Screenshot zeigt: Die Vorschau-Seite zeigt "Keine Video-Daten" obwohl das Video erfolgreich gerendert wurde. 

**Root Cause:** Nach erfolgreichem Rendering wird `onComplete()` mit entweder `result_data` (aus `universal_video_progress`) oder `{ outputUrl: outputFile }` aufgerufen. Keines davon enthält `scenes[]`. Der `UniversalPreviewPlayer` prüft `project.scenes.length > 0` und zeigt den Fehler-State.

**Das Problem ist zweigeteilt:**
1. `result_data` wird im Backend nie mit den originalen Szenen-Daten befüllt
2. Der Preview-Player versucht den Remotion Player zu nutzen (braucht Szenen), statt einfach das fertig gerenderte MP4 abzuspielen

## Plan (r18 — Preview nach Render-Completion)

### 1. `UniversalPreviewPlayer` um MP4-Fallback erweitern
- **Datei:** `src/components/universal-video-creator/UniversalPreviewPlayer.tsx`
- Wenn `project.outputUrl` vorhanden ist aber keine `scenes`: fertiges MP4 in einem HTML5 `<video>` Player anzeigen (mit Play/Pause, Lautstärke, Vollbild)
- `hasValidData` Logik anpassen: `true` wenn entweder `scenes.length > 0` ODER `outputUrl` vorhanden
- Aspect-Ratio-Selektor bleibt für UI-Konsistenz

### 2. `onComplete`-Aufrufe mit `outputUrl` absichern
- **Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Bei Zeile 508-516: Sicherstellen dass `outputUrl` immer im Projekt-Objekt enthalten ist, auch wenn `result_data` existiert (merge: `{ ...finalData.result_data, outputUrl: outputFile }`)

### Dateien
- `src/components/universal-video-creator/UniversalPreviewPlayer.tsx`
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

