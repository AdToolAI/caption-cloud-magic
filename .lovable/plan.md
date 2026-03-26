

## Fix: Übergänge in Preview wiederherstellen ohne Doppel-Decode

### Problem
Du hast recht — die Per-Scene-Architektur ist bewusst so gebaut, damit Szenen einzeln verlängert, verlangsamt und angepasst werden können. Das darf nicht entfernt werden.

Das aktuelle Problem hat zwei klare Ursachen:
1. **Transitions in Preview komplett deaktiviert**: Zeile 813 übergibt `transitions={previewMode ? [] : transitions}` — dadurch sieht man im Editor nur harte Cuts, keine Übergänge
2. **Ruckeln in Steps 3–11**: Das Underlay (zweite Video-Szene parallel) ist im Preview abgeschaltet (Zeile 759: `!previewMode && ...`), aber pro Szene wird trotzdem ein eigenes `<Video>` gemountet/unmountet, was an Szenengrenzen kurz ruckelt

### Lösung
Die Per-Scene-Architektur bleibt komplett erhalten. Stattdessen:

**1. Transitions im Preview wieder aktivieren (nur CSS-basiert)**
- `transitions={previewMode ? [] : transitions}` ändern zu `transitions={transitions}` — die SceneVideo-Komponente berechnet bereits CSS-Opacity/Transform/ClipPath-Effekte für Übergänge (Zeile 425–484), das sind reine CSS-Operationen ohne zweiten Decoder
- Das Underlay (`!previewMode && hasTransitionToNext`) bleibt im Preview aus — die Transitions wirken dann als Fade-to-Black / Wipe / Slide ohne dass die nächste Szene drunter sichtbar ist, was aber visuell trotzdem den Übergang zeigt

**2. Ruckeln an Szenengrenzen reduzieren**
- `pauseWhenBuffering` auf dem `<Video>` in SceneVideo aktivieren, damit Remotion bei Szenen-Mount kurz wartet statt Frames zu droppen
- Prüfen ob `pauseWhenBuffering` bereits gesetzt ist, und ggf. ergänzen

### Dateien
1. `src/remotion/templates/DirectorsCutVideo.tsx` — Transitions im Preview re-aktivieren (CSS-only, kein Underlay), pauseWhenBuffering sicherstellen

### Was sich nicht ändert
- Per-Scene `<Sequence>` + `<Video>` Architektur bleibt bestehen
- Szenen-Verlängerung, Slow-Motion, individuelle Effekte funktionieren weiterhin
- Finaler Render bleibt unverändert (mit Underlay für echte Crossfades)
- Audio-Handling bleibt wie es ist

