

## Plan: Sidebar-Clipping fix + Szenen-Advance reparieren

### Probleme

**1. Sidebar abgeschnitten**: Der Sidebar-Container hat `w-80` aber kein `flex-shrink-0`. Im Flex-Layout (`flex-1 flex overflow-hidden`) kann der Browser die Sidebar komprimieren.

**2. Nur Szene 1 spielt**: Die `original_start_time`-Logik ist zwar korrekt implementiert, aber der Scene-Advance hat drei subtile Probleme:

- **Seek-Schwelle zu hoch**: Bei der Szenengrenze wird nur geseekt wenn `abs(video.currentTime - nextSourceStart) > 0.3`. Wenn die Szenen direkt aneinandergrenzen (Scene1 endet bei Source 10, Scene2 beginnt bei Source 10), ist die Differenz ≈ 0 → kein Seek → Video fließt weiter, aber die Szenen-Erkennung (`findSceneBySourceTime`) findet wegen der 0.05-Toleranz weiter Scene 1 statt Scene 2
- **PlaybackRate nicht sofort gesetzt**: Beim Szenen-Wechsel wird die neue Rate erst im "unified speed block" gesetzt (der läuft NACH der Szenen-Logik). Wenn Scene 1 = 0.5x und Scene 2 = 1x, spielt die erste Sekunde von Scene 2 noch mit 0.5x
- **video.onEnded stoppt alles**: Wenn das physische Video endet, wird `handleVideoEnded()` ausgelöst — auch wenn noch Timeline-Szenen übrig sind (z.B. bei Multi-Clip-Szenarien)

### Lösung

**Datei 1: `CapCutEditor.tsx`** — Sidebar `flex-shrink-0`

Zeile 1441-1442: `flex-shrink-0` hinzufügen damit die Sidebar nicht komprimiert wird:
```
sidebarCollapsed ? "w-12" : "w-80 flex-shrink-0"
```
Gleiches für Properties-Panel (Zeile 1704-1706).

**Datei 2: `DirectorsCutPreviewPlayer.tsx`** — Scene-Advance robuster machen

1. **Forcierter Mini-Seek** (Zeile ~670): Wenn die Differenz < 0.3 aber > 0 ist, trotzdem `video.currentTime = nextSourceStart + 0.05` setzen, damit `findSceneBySourceTime` Scene 2 sofort findet statt 5 Frames in der Toleranzzone von Scene 1 zu hängen

2. **PlaybackRate sofort setzen** (Zeile ~675): Direkt nach dem Seek `video.playbackRate = nextScene.playbackRate ?? 1` setzen

3. **onEnded-Safety** (Zeile ~370): In `handleVideoEnded` prüfen ob noch Szenen übrig sind. Falls ja, zur nächsten Szene seeken statt Playback zu stoppen

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `CapCutEditor.tsx` | `flex-shrink-0` an Sidebar + Properties Panel |
| Edit | `DirectorsCutPreviewPlayer.tsx` | Forcierter Seek, sofortige Rate, onEnded-Safety |

### Ergebnis

- Sidebar wird nicht mehr abgeschnitten
- Szenen-Wechsel funktioniert zuverlässig bei unterschiedlichen Geschwindigkeiten
- Kein Hänger oder Verzögerung beim Übergang zwischen Szenen

