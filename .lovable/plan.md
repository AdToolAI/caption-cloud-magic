## Problem

`GripVertical` in der Szenen-Liste ist rein dekorativ — kein Drag-Handler hängt daran. Auch die Timeline-Blöcke lassen sich zwar innerhalb ihrer Zeit-Position schieben (Trim), aber nicht **untereinander vertauschen**. Der User erwartet CapCut-Verhalten: Szene 3 vor Szene 1 ziehen → Reihenfolge wechselt.

## Umsetzung

### 1. Reorder-Handler im Editor

`src/components/directors-cut/studio/CapCutEditor.tsx`:

- Neuer Callback `handleReorderScenes(fromIndex, toIndex)`:
  - Baut neue Szenen-Array via Array-Move.
  - Rechnet `start_time` / `end_time` **sequentiell** neu: jede Szene behält ihre `duration = end_time - start_time`, wird ab `start_time = prev.end_time` (oder 0 für die erste) neu positioniert. So bleibt die Länge jeder Szene identisch, nur die Position auf der Master-Timeline verschiebt sich — analog CapCut / Premiere Track-Reorder.
  - Ruft `commitHistory` (Undo-Support) auf und propagiert via `onScenesUpdate`.
  - Passt `transitions` (Between-Scene-Übergänge) mit an: Transitions sind an `beforeSceneId`/`afterSceneId` gebunden — die Referenzen bleiben gültig, nur ihre effektive Position verschiebt sich mit.

- Callback via Prop `onReorderScenes` an `CapCutSidebar` durchreichen, dort weiter an `CutPanel`.

### 2. Drag-and-Drop in der Szenen-Liste (`CutPanel`)

`src/components/directors-cut/studio/sidebar/CutPanel.tsx`:

Nutzt bereits `@dnd-kit/core` (siehe DraggableMusicItem). Für Sortierbarkeit stattdessen `@dnd-kit/sortable` (bereits im Projekt via package.json vorhanden — falls nicht, standardmäßig bei dnd-kit installiert).

- Umschließen der Szenen-Liste mit `DndContext` + `SortableContext` (vertical strategy).
- Neue Sub-Component `SortableSceneCard` nutzt `useSortable({ id: scene.id })` — bindet `attributes` / `listeners` an das `GripVertical`-Handle (nur dieses, damit Klicks auf die Karte weiterhin die Szene auswählen).
- Cursor am Grip auf `cursor-grab` / `active:cursor-grabbing`; Karte bekommt `opacity-50` während `isDragging`.
- `onDragEnd`: findet `oldIndex` / `newIndex` und ruft `onReorderScenes(oldIndex, newIndex)`.

### 3. Timeline-Block-Reorder (optional, im gleichen Schritt)

Timeline-Video-Blöcke (`CapCutEditor` Timeline-Row) haben bereits Drag-Logic für Zeitverschiebung. Zusätzlich wird beim **horizontalen Drop-Over eines anderen Blocks** (Mitte-Überlappung > 50 %) statt Trim ein Reorder ausgelöst — ruft denselben `handleReorderScenes` auf.

Erkennungslogik: Wenn `dragMode === 'move'` und der aktuelle Center-X mitten in einer Nachbar-Szene liegt → visueller Insertion-Marker (goldene vertikale Linie zwischen den zwei Szenen), bei Release: Reorder.

Wenn das Timeline-Refactoring hier zu invasiv wird, liefern wir **Schritt 3 in einem Folge-Turn** und schließen diesen Turn mit funktionierendem Drag-Reorder in der Sidebar-Liste ab.

### 4. Verifikation via Playwright

- Öffne Director's Cut mit 3 vorhandenen Szenen.
- Ziehe Szene 3 per Grip über Szene 1.
- Screenshot: Reihenfolge in der Liste jetzt `3, 1, 2`; Timeline-Blöcke ebenfalls in neuer Reihenfolge; Preview spielt Szene 3 zuerst.

## Nicht enthalten

- Kein DB-Persist neuer Feld-Struktur — `scenes` wird weiterhin als geordnetes Array serialisiert.
- Keine Änderung an Transition-Auswahl-UI.
- Keine i18n-Key-Änderungen (Grip-Tooltip nutzt existierendes `dc.reorder` falls vorhanden, sonst inline literal `Ziehen zum Vertauschen` / `Drag to reorder`, hinzugefügt zu i18n).
