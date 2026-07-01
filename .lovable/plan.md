## Problem

Beim Trimmen einer Szene über die Sidebar-Eingaben ("Start"/"End" im Cut-Panel) und beim Trimmen des Original-Audio-Clips im Inspector wird das Video visuell nicht geschnitten. Der Preview-Player zeigt weiterhin das gesamte Original ab Sekunde 0.

## Root Cause (Technisch)

Der aktuelle `handleTrimScene` in `CapCutEditor.tsx` schreibt `newStart`/`newEnd` in `start_time`/`end_time` der Szene:

```ts
s.id === sceneId ? { ...s, start_time: newStart, end_time: newEnd } : s
```

`CapCutPreviewPlayer.getVideoTime()` interpretiert `start_time`/`end_time` aber als **Timeline-Position**, nicht als Quellen-Offset. Für Seed-Szenen ohne `original_start_time` fällt es auf die Legacy-Kumulation zurück (`originalTime = currentTime - scene.start_time`). Ergebnis: Setzt der User Start=2, End=15, wandert der Szenen-Block auf der Timeline nach rechts, aber die Video-Quelle spielt trotzdem ab Sekunde 0 — kein echter Schnitt.

Zusätzlich bleibt `duration` (via `Math.max(...scenes.map(s => s.end_time))`) auf 15s, so dass der 0–2s-Gap als schwarze Fläche/leere Zone bleibt statt zu verschwinden.

## Fix-Plan

### 1. `handleTrimScene` in `src/components/directors-cut/studio/CapCutEditor.tsx` umschreiben

Die Sidebar-Inputs sollen als **Quellen-Range** (source in/out) interpretiert werden — das ist die natürliche User-Erwartung ("schneide die Szene bei 2s an, bei 15s ab"):

```ts
const handleTrimScene = useCallback((sceneId: string, srcIn: number, srcOut: number) => {
  if (!onScenesUpdate) return;
  const sorted = [...scenes].sort((a, b) => a.start_time - b.start_time);
  const idx = sorted.findIndex(s => s.id === sceneId);
  if (idx < 0) return;

  const target = sorted[idx];
  const origStart = target.original_start_time ?? target.start_time;
  const origEnd   = target.original_end_time   ?? target.end_time;

  // Clamp innerhalb der ursprünglichen Quelle
  const newSrcIn  = Math.max(origStart, Math.min(srcIn, srcOut - 0.1));
  const newSrcOut = Math.min(origEnd,   Math.max(srcOut, newSrcIn + 0.1));
  const newDur    = newSrcOut - newSrcIn;

  // Timeline-Position der Zielszene bleibt (Ripple über Nachfolger unten)
  const timelineStart = target.start_time;
  sorted[idx] = {
    ...target,
    original_start_time: newSrcIn,
    original_end_time:   newSrcOut,
    start_time: timelineStart,
    end_time:   timelineStart + newDur,
  };

  // Ripple: nachfolgende Szenen an neuen End-Punkt anhängen
  for (let i = idx + 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const dur  = sorted[i].end_time - sorted[i].start_time;
    sorted[i] = {
      ...sorted[i],
      start_time: prev.end_time,
      end_time:   prev.end_time + dur,
    };
  }

  onScenesUpdate(sorted);
}, [scenes, onScenesUpdate]);
```

Damit:
- Der Preview-Player nimmt in `getVideoTime()` bereits den `original_start_time`-Pfad (siehe `CapCutPreviewPlayer.tsx` Zeile 138–140) — d.h. der Schnitt wird sofort korrekt gerendert.
- Die Timeline-Länge (`Math.max(...end_time)`) schrumpft auf die Netto-Dauer, kein leerer 0–2s-Gap mehr.

### 2. `duration`-Berechnung stabilisieren

In `DirectorsCut.tsx` (Zeile ~279) wird die Preview-Dauer aus `Math.max(base, ...scenes.end_time)` bestimmt. Nach dem Ripple-Fix in Punkt 1 stimmt das automatisch — keine Änderung nötig.

### 3. CutPanel-Label klarstellen

In `src/components/directors-cut/studio/sidebar/CutPanel.tsx` (Zeile ~443/455) die zwei Inputs klarer beschriften ("Quelle Start (s)" / "Quelle End (s)" statt "Start"/"End"), damit der User versteht, dass er den Bereich aus dem Original-Video wählt. Optional, nicht funktional relevant.

### 4. Inspector-Audio-Trim bleibt wie ist

`applyTrim` im `CapCutPropertiesPanel` funktioniert bereits korrekt (Trim Start/End verschiebt `trimStart`/`trimEnd` + `startTime`/`duration`). Das ist unabhängig vom Szenen-Trim.

## Änderung nach Freigabe

- `src/components/directors-cut/studio/CapCutEditor.tsx` — `handleTrimScene` neu (~15 Zeilen).
- (optional) `src/components/directors-cut/studio/sidebar/CutPanel.tsx` — Labels umbenennen.

Keine anderen Dateien, keine Backend-Änderungen, keine neuen Deps.