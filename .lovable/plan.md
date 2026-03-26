

## Fix: Stocken in der Preview beseitigen + Audio unabhängig halten

### Bestätigte Ursachen

**Stocken:** Jede Szene hat ein eigenes `<Video>` mit `pauseWhenBuffering` (Zeile 516). In der Preview bedeutet das: sobald eine neue Szene startet und der Browser den Video-Decoder noch nicht bereit hat, **friert die gesamte Komposition ein**, bis das Buffering abgeschlossen ist. Das ist das sichtbare Stocken an jedem Szenenübergang.

**Audio:** Der Sound läuft bereits korrekt unabhängig — die Preview nutzt native HTML5 `<Audio>`-Elemente (Zeile 296-315 in `DirectorsCutPreviewPlayer.tsx`), die vom Remotion-Player entkoppelt sind. Das Remotion-Template selbst hat `previewMode: true` und rendert keine `<Audio>`-Komponenten. Das ist richtig so.

### Lösung

Einzige Änderung in `src/remotion/templates/DirectorsCutVideo.tsx`:

**`pauseWhenBuffering` im Preview-Modus deaktivieren.** Im Preview ist es besser, kurz Frames zu droppen, als die gesamte Komposition einzufrieren. Beim finalen Render (Lambda) bleibt `pauseWhenBuffering` aktiv, damit keine Frames fehlen.

Konkret: Zeile 516 ändern von:
```
pauseWhenBuffering
```
zu:
```
pauseWhenBuffering={!previewMode}
```

Dasselbe für den Fallback-Video ohne Szenen (Zeile 643).

### Was sich nicht ändert
- Per-Scene `<Video>` + TransitionSeries-Architektur bleibt bestehen
- Audio bleibt unabhängig über native HTML5 Audio
- Finaler Render behält `pauseWhenBuffering={true}` für frame-perfekte Ausgabe
- Szenen-Verlängerung, Slow-Motion, Übergänge funktionieren weiterhin

### Datei
- `src/remotion/templates/DirectorsCutVideo.tsx` — `pauseWhenBuffering` conditional auf `!previewMode`

