

## Plan: Gelben Playhead-Regler aus der Timeline entfernen

### Problem
Der gelbe (Gold #F5C76A) Playhead-Regler in der CapCut-Timeline funktioniert nicht zuverlässig und stört die Bedienung. Das Seeking per Klick auf die Timeline funktioniert bereits korrekt ohne ihn.

### Lösung
Den gesamten gelben Playhead-Indikator und seine Drag-Logik aus `CapCutTimeline.tsx` entfernen:

- **Zeile 925–946**: Das goldene Playhead-Element (Linie + Dreieck-Handle) löschen
- **Zeile 564–609**: Die `isDraggingPlayhead`-State-Variable und den zugehörigen `useEffect` für Maus-Drag entfernen
- **Zeile 649**: `playheadPosition`-Variable entfernen (wird nicht mehr benötigt)

Das Seeking funktioniert weiterhin über den Timeline-Klick (`handleTimelineClick`, Zeile 567–573).

### Datei
- **Edit**: `src/components/directors-cut/studio/CapCutTimeline.tsx`

