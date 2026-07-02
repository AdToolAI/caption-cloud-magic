# Fix: Neue Szene wird auf Original-Länge geklemmt statt Timeline zu verlängern

## Root Cause
`findBestInsertionCell` in `src/lib/directors-cut/timelineAnchors.ts` (Zeile 151–152) fällt zurück auf die **größte existierende Zelle** wenn keine freie Zelle gefunden wird. Bei voller Timeline (z. B. Scene 1 0→12.6s + Scene 2 12.6→15s) sind alle Zellen belegt, aber die Funktion gibt die größte belegte Zelle (0→12.6s) zurück statt `null`. `fitSceneToCell` platziert die neue Szene dann bei `start=0, end=5` — **überlappend** mit Scene 1, statt hinter Scene 2 angehängt.

Der Fallback in `pickInsertionFit` (`CapCutEditor.tsx:1187–1190`, "append after last scene") wird dadurch nie erreicht.

## Fix (1 Datei, 2 Zeilen)
`src/lib/directors-cut/timelineAnchors.ts` Zeilen 151–152 ersetzen:

```ts
// vorher
// Fallback: largest cell
return [...cells].sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];

// nachher
// No free cell → signal caller to append past the timeline end instead
// of overlapping an occupied region.
return null;
```

Damit greift `pickInsertionFit`'s Append-Fallback: neue Szene startet bei `lastScene.end_time`, Timeline wächst auf 15 + 5 = 20 s (bzw. 15 + Clip-Länge).

## Auswirkung
- Empty-Scene-Add (`handleSceneAdd`): 5 s werden ans Ende angehängt.
- Video-Import als Szene (`handleAddVideoAsScene`): volle Clip-Länge wird ans Ende angehängt.
- `actualTotalDuration = max(scene.end_time)` erweitert Preview-Player, Timeline und Export automatisch.
- Kein Regress für Insert-am-Playhead-in-freie-Zelle-Cases (die laufen weiterhin über den Free-Cell-Pfad).
