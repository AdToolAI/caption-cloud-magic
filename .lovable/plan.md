

## Plan: Export-Fehler beheben — Feldnamen-Mismatch

### Problem

Der Export schlägt mit **400** fehl, weil der Client camelCase-Feldnamen sendet, die Edge Function aber snake_case erwartet. Konkret:

| Client sendet | Edge Function erwartet |
|---|---|
| `videoUrl` | `source_video_url` ← **Validierung schlägt fehl** |
| `projectId` | `project_id` |
| `exportSettings` | `export_settings` |
| `colorGrading` | `color_grading` |
| `styleTransfer` | `style_transfer` |
| `voiceOverUrl` | `voiceover_url` |
| `backgroundMusicUrl` | `background_music_url` |
| `subtitleTrack` | `subtitle_track` |

Die Funktion prüft `if (!source_video_url)` und gibt sofort 400 zurück.

### Änderung

**Datei: `src/components/directors-cut/studio/CapCutEditor.tsx`** (Zeile 978-995)

Body-Felder auf snake_case umbenennen + fehlende Felder ergänzen:

```typescript
body: {
  project_id: savedProjectId,
  source_video_url: cleanedVideoUrl || videoUrl,
  scenes: scenes.map(s => ({ ... })),
  effects: appliedEffects?.global || { ... },
  color_grading: colorGrading,
  style_transfer: styleTransfer,
  transitions: transitions || [],
  export_settings: exportSettings || { quality: 'hd', format: 'mp4', fps: 30, aspect_ratio: '16:9' },
  voiceover_url: voiceOverUrl,
  background_music_url: audioTracks.find(...),
  subtitle_track: showSubtitles ? subtitleTrack : undefined,
  duration_seconds: videoDuration || scenes.reduce((sum, s) => sum + (s.end_time - s.start_time), 0),
}
```

### Ergebnis

Export-Request sendet die korrekten Feldnamen → Edge Function validiert erfolgreich → Render-Job wird erstellt.

