

## Plan: Szene-2-Advance Fix — `original_start_time` für alle Szenen setzen

### Problem

Wenn die Geschwindigkeit von Szene 1 geändert wird (z.B. 0.5x), wird deren Timeline-Dauer verdoppelt. Die nachfolgenden Szenen werden auf der Timeline korrekt verschoben (`start_time` = 20 statt 10). **Aber**: Diese Szenen bekommen kein `original_start_time` gesetzt.

Im Preview-Player nutzt die Szenen-Advance-Logik:
```
const nextSourceStart = nextScene.original_start_time ?? nextScene.start_time;
video.currentTime = nextSourceStart;   // ← Seek im SOURCE-Video
```

Da `original_start_time` fehlt, wird `start_time` (= 20, Timeline-Zeit) als Source-Seek-Position verwendet. Aber im Source-Video liegt Szene 2 bei z.B. Sekunde 10. Ergebnis: Seek über das Video-Ende hinaus → nur Szene 1 wird abgespielt.

Gleicher Bug in `findSceneBySourceTime`: `srcStart = s.original_start_time ?? s.start_time` — Szene 2 wird mit Source-Start 20 gesucht, obwohl sie bei Source 10 anfängt → nie gefunden.

### Lösung

**Datei: `src/components/directors-cut/studio/CapCutEditor.tsx`** (Zeilen 908-915)

Beim Neuberechnen der nachfolgenden Szenen-Timings auch `original_start_time` und `original_end_time` setzen, falls sie noch nicht existieren — **bevor** `start_time`/`end_time` verschoben werden:

```typescript
const sorted = [...updatedScenes].sort((a, b) => a.start_time - b.start_time);
for (let i = 1; i < sorted.length; i++) {
  const prev = sorted[i - 1];
  const dur = sorted[i].end_time - sorted[i].start_time;
  // Preserve original source positions for unmodified scenes
  const origStart = sorted[i].original_start_time ?? sorted[i].start_time;
  const origEnd = sorted[i].original_end_time ?? sorted[i].end_time;
  sorted[i] = {
    ...sorted[i],
    start_time: prev.end_time,
    end_time: prev.end_time + dur,
    original_start_time: origStart,
    original_end_time: origEnd,
  };
}
```

Das bewahrt die echten Source-Positionen, sodass der Player korrekt im Video seekt.

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `CapCutEditor.tsx` | `original_start_time`/`original_end_time` für alle nachfolgenden Szenen setzen |

### Ergebnis

Alle Szenen spielen korrekt ab, auch wenn vorherige Szenen eine andere Geschwindigkeit haben. Der Player seekt zur richtigen Source-Position.

