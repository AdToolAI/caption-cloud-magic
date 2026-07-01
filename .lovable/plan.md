## Problem

Der Screenshot zeigt: Video ist importiert (Preview + Original-Audio-Waveform sichtbar, Dauer 0:15), aber der **Video-Track ist leer** ("Szenen 0", "Timeline ist leer").

Grund im Code (`src/pages/DirectorsCut/DirectorsCut.tsx` → `handleVideoSelected`): Nach dem Import wird nur `handleStartAnalysis()` getriggert. Das läuft PySceneDetect → Frames → Boundaries → `setScenes(...)`. Wenn diese Kette langsam ist oder still fehlschlägt (Proxy-Extract, Boundary-Fusion), bleibt `scenes = []` — der Video-Track ist bis dahin komplett leer, obwohl Audio bereits da ist.

## Fix — "Seed-Scene beim Import"

Sofort beim Import eine einzige Full-Length-Szene anlegen, damit die Timeline nie leer ist. Auto-Cut ersetzt diese Szene später durch die erkannten Cuts (idempotent, existierender Code in `handleStartAnalysis` überschreibt `scenes` ohnehin per `setScenes(normalizedScenes)`).

### Änderungen in `src/pages/DirectorsCut/DirectorsCut.tsx`

1. **`handleVideoSelected`**: direkt nach `setSelectedVideo(video)` (Zeile 968) eine Seed-Szene setzen:
   - Dauer via `video.duration` oder — falls fehlend — `measureVideoDuration(video.url)` (async, schon vorhanden).
   - `setScenes([{ id: 'seed-1', start_time: 0, end_time: duration, thumbnail_url: video.thumbnail_url ?? null, ... SceneAnalysis-Defaults }])`.
   - Nur setzen, wenn `scenes.length === 0` (keine Draft-Wiederherstellung überschreiben).

2. **Auto-Cut Übergang schützen**: In `handleStartAnalysis` bleibt bestehende Logik. Der neue Seed-State soll den "looksLikeEdl"-Check nicht triggern → Seed bekommt Marker `source: 'seed'` und wird im Check ausgeschlossen.

3. **Composer-Handoff unverändert**: Wenn `video.composerProjectId` gesetzt ist, keine Seed-Szene (EDL kommt aus Composer-Pipeline).

4. **Fehler-Fallback in Analyse**: Wenn `handleStartAnalysis` fehlschlägt und `scenes.length === 0`, im `catch`/`finally` sicherstellen, dass mindestens die Seed-Szene erhalten bleibt (nicht auf `[]` zurücksetzen).

### UX-Detail

- Kein neuer Toast nötig — User sieht sofort einen Video-Clip in der Timeline mit der korrekten Länge.
- Nach Auto-Cut ersetzen die erkannten Szenen den Seed nahtlos.
- Manuelles "Am Playhead teilen" funktioniert dadurch **sofort** nach Import (aktuell scheitert es an `scenes = []`).

### Nicht Teil dieser Änderung

- PySceneDetect-Reliability, Frame-Extraction-Fallbacks, Composer-EDL — bleiben unverändert.
- Sidebar-CTA "Video hinzufügen" / "Leere Szene" — Verdrahtung bleibt.
