

## Fix: Übergänge 2 und 3 sind versetzt — Offset-Berechnung ist falsch

### Gefundener Bug

In Zeile 353 wird der Incoming-Video-Offset so berechnet:

```typescript
const incomingOffset = progress * tDuration * inRate;
const expectedIncoming = incomingSourceStart + incomingOffset;
```

Das Problem: `progress` geht von 0→1 über `tDuration` Sekunden. Bei progress=1 ist der Offset also `tDuration * rate` Sekunden in die neue Szene hinein.

**Aber** nach Ende der Transition übernimmt das Base-Video mit:
```typescript
sourceTimeForScene(scene, timelineTime) = sourceStart + (timelineTime - scene.start_time) * rate
```

Am Ende der Transition ist `timelineTime = boundary + half`, und `scene.start_time = boundary`, also Offset = `half * rate`.

Da `tDuration = 2 * half`, zeigt das Incoming-Video am Ende `2× so weit` in die Szene wie das Base-Video danach erwartet → **Sprung rückwärts** bei jedem Übergang. Das erklärt, warum Übergang 1 noch okay aussieht, aber 2 und 3 zunehmend versetzt wirken.

### Fix

Statt den Offset aus `progress * tDuration` zu berechnen, direkt `sourceTimeForScene(incomingScene, timelineTime)` verwenden — mit Clamping für die erste Hälfte (wenn `timelineTime` noch vor `incomingScene.start_time` liegt):

```typescript
// Statt: incomingSourceStart + progress * tDuration * inRate
// Neu:
const expectedIncoming = timelineTime >= incomingScene.start_time
  ? sourceTimeForScene(incomingScene, timelineTime)
  : incomingSourceStart;
```

So ist die Position des Incoming-Videos am Ende der Transition **exakt identisch** mit dem, was das Base-Video danach erwartet → kein Sprung, kein Versatz.

### Betroffene Stellen

**`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**:
1. **Zeilen 348-354** (rAF Tick, Incoming-Sync): Offset-Berechnung durch `sourceTimeForScene` mit Clamp ersetzen
2. **Zeilen 538-541** (handleSeek, Incoming-Sync): Gleiche Fix anwenden

### Technische Kurzfassung
```text
Bug:     incomingOffset = progress * tDuration * rate
         → am Ende der Transition 2× so weit wie Base-Video erwartet
         → Rücksprung bei Übergangsende
         → akkumuliert über mehrere Übergänge

Fix:     expectedIncoming = sourceTimeForScene(incomingScene, timelineTime)
         → mit clamp auf sourceStart wenn timelineTime < scene.start_time
         → nahtloser Übergang zum Base-Video
```

