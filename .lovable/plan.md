

## Plan: Video Cutter Upgrade im Director's Cut (Schritt 3 — Szenen-Editor)

### Aktueller Stand

Der SceneEditingStep hat bereits: Split (Mitte), Delete mit Undo, Copy, Duration-Slider, AI Remix, Timeline mit Divider-Drag, Transitions, Keyboard-Shortcuts. Was fehlt für einen professionellen Video Cutter:

### Was gebaut wird

**1. Split at Playhead** (statt immer in der Mitte)
- `handleSplitScene` wird erweitert: wenn `currentVideoTime` innerhalb der Szene liegt, wird dort geschnitten statt in der Mitte
- Visueller Indikator auf der Timeline: "Schnitt hier setzen" am Playhead

**2. Drag-to-Reorder Szenen auf der Timeline**
- `@dnd-kit/core` (bereits im Projekt) für die VisualTimeline aktivieren
- Szenen per Drag & Drop in der Timeline-Leiste umsortieren
- `onScenesReorder` Callback mit automatischer Zeitneuberechnung (start_time/end_time werden sequenziell neu gesetzt)

**3. Range-Selection / Multi-Select zum Löschen**
- Shift+Click für Mehrfachauswahl auf der Timeline
- "Ausgewählte löschen" Button wenn >1 Szene selektiert
- Alle selektierten Szenen auf einmal entfernen mit Undo-Support

**4. Trim-Handles an Szenen-Rändern**
- Links/Rechts-Handles an jeder Szene in der Timeline
- Drag zum Trimmen des In-/Out-Points (unabhängig vom Divider, der nur die Grenze verschiebt)
- Trimmed-Content wird visuell ausgegraut angezeigt

**5. "Cut Segment" Modus**
- Button "Segment entfernen": Markiert einen Bereich (In/Out-Point per Click auf Timeline)
- Der markierte Bereich wird aus der Szene herausgeschnitten
- Szene wird automatisch in 2 Teile gesplittet, mittlerer Teil entfernt

### Dateien

| Aktion | Datei |
|--------|-------|
| Edit | `src/components/directors-cut/steps/SceneEditingStep.tsx` — Split-at-Playhead, Multi-Select, Segment-Remove |
| Edit | `src/components/directors-cut/ui/VisualTimeline.tsx` — Drag-Reorder, Trim-Handles, Range-Selection, Cut-Segment-Marker |
| Edit | `src/components/directors-cut/ui/ContextualActionBar.tsx` — Neue Buttons für Multi-Delete und Segment-Cut |

### Reihenfolge
1. Split at Playhead (SceneEditingStep)
2. Drag-to-Reorder (VisualTimeline mit dnd-kit)
3. Multi-Select + Batch-Delete
4. Trim-Handles
5. Segment-Cut Modus

