

## Fix: Audio-Clips im Director's Cut leichter verschieben & trimmen

### Problem
Aktuell ist nur das winzige Drag-Handle (⠿ Icon, 12×12px) am Audio-Clip ziehbar. Der Rest des Clips selektiert nur. Das macht es fast unmöglich, einen Soundtrack präzise zu verschieben oder zu trimmen.

### Lösung

**1. Gesamter Clip wird ziehbar** (nicht nur das Handle)
- Die `useDraggable` Listeners auf den gesamten Clip-Container legen statt nur auf das GripVertical-Icon
- Click ohne Bewegung = Selektion, Drag = Verschieben (bereits durch `activationConstraint: { distance: 5 }` abgedeckt)

**2. Numerische Positionierung im Properties-Panel**
- Wenn ein Audio-Clip selektiert ist, Eingabefelder für **Start-Zeit** und **Dauer** anzeigen
- Direkte Zahleneingabe in Sekunden (z.B. `2.5s`) für exakte Positionierung
- Trim-Start/Trim-End ebenfalls editierbar

**3. Breitere Resize-Handles**
- Von 2px (`w-2`) auf 6px (`w-1.5` → `w-[6px]`) verbreitern
- Deutlichere visuelle Hervorhebung beim Hover (hellere Farbe, Cursor)

**4. Snap-to-Playhead**
- Beim Drag eines Clips wird er an der Playhead-Position eingerastet (wenn nah genug, z.B. < 0.5s)
- Visueller Snap-Indikator

### Dateien
- **Edit**: `src/components/directors-cut/timeline/AudioClipComponent.tsx` — Drag auf gesamten Clip, breitere Handles
- **Edit**: `src/components/directors-cut/timeline/MultiTrackTimelinePro.tsx` — Snap-Logik im `handleDragEnd`
- **Edit**: Properties-Panel (wo Clip-Details bearbeitet werden) — Numerische Start/Dauer-Felder

