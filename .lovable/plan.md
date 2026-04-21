

## Feature: Szenen per Drag & Drop sortieren (Storyboard + Clips)

### Idee
Statt nur ▲/▼-Buttons sollen Szenen direkt mit der Maus an die gewünschte Position gezogen werden können — sowohl im **Storyboard-Tab** als auch im **Clips-Tab**. Buttons bleiben als Fallback (Tastatur, Touch, Accessibility) erhalten.

### Umsetzung

#### 1) Drag-&-Drop-Library: `@dnd-kit`
Installiere `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

Warum `@dnd-kit` und nicht z. B. `react-beautiful-dnd`:
- Aktiv gepflegt, React-18-/19-kompatibel
- Voll Touch- und Keyboard-zugänglich (Pfeiltasten + Space funktionieren weiter)
- Kein Konflikt mit existierenden Click-Handlern (Buttons in der Karte bleiben klickbar)
- Kleines Bundle (~10 KB gzipped)

#### 2) Wiederverwendbarer `SortableSceneItem`-Wrapper
**Neue Datei:** `src/components/video-composer/SortableSceneItem.tsx`

Dünner Wrapper um `useSortable()`, der:
- die Karte als Drag-Item registriert
- einen sichtbaren **Drag-Handle** (`GripVertical`-Icon) links an der Karte rendert — nur dieser Bereich startet das Ziehen, damit Klicks auf Buttons/Inputs in der Karte nicht versehentlich Drags auslösen
- während des Ziehens die Karte leicht hebt (Schatten + 1.02-Scale + reduzierte Opacity am Originalplatz)

#### 3) Integration im Storyboard-Tab
**Datei:** `src/components/video-composer/StoryboardTab.tsx`

- `<DndContext>` + `<SortableContext>` um die Scene-Liste legen
- Jede `SceneCard` in `SortableSceneItem` einwickeln
- `onDragEnd` ruft die bestehende `moveScene`-Logik mit `arrayMove(scenes, oldIndex, newIndex)` auf und persistiert via `onUpdateScenes` (Auto-Save greift wie bisher)
- Bestehende ▲/▼-Buttons in `SceneCard` bleiben unverändert

#### 4) Integration im Clips-Tab
**Datei:** `src/components/video-composer/ClipsTab.tsx`

- Gleiches Muster: `<DndContext>` + `<SortableContext>` um die Clip-Karten-Liste
- Zusätzlich kleiner Order-Badge (#1, #2, …) links neben dem Drag-Handle für schnelle Orientierung
- Reorder-Handler analog zum Storyboard-Tab; bestehender debounced Auto-Save in `useComposerPersistence` schreibt `order_index` per Two-Phase-Write korrekt zurück
- Während aktiver Generierung (`clipStatus === 'generating'`): Drag bleibt erlaubt, weil Polling per Scene-`id` matcht — die laufende Edge-Function ist von der Reihenfolge unabhängig

#### 5) UX-Feinheiten
- **Drag-Handle sichtbar**: kleiner `GripVertical`-Icon-Button mit `cursor-grab` / `active:cursor-grabbing`
- **Drop-Indikator**: `@dnd-kit/sortable` animiert die Lücke automatisch — keine extra CSS-Arbeit nötig
- **Scrolling**: Bei langen Listen wird automatisch gescrollt, wenn man eine Karte an den oberen/unteren Rand zieht (Built-in)
- **Tastatur-Support**: Fokus auf Drag-Handle → Space hebt an → Pfeiltasten verschieben → Space legt ab. Voll barrierefrei.
- **Touch**: Funktioniert auf Mobile/Tablet via `PointerSensor` mit kleiner Distanzschwelle (5 px), damit normales Scrollen nicht versehentlich Drags startet.

### Was bewusst nicht passiert
- **Keine DB-Schema-Änderung.** `composer_scenes.order_index` bleibt wie es ist; die existierende Two-Phase-Write-Persistenz handhabt Umsortierungen bereits sauber.
- **Buttons werden nicht entfernt.** ▲/▼ bleiben als sekundäre, immer sichtbare Option (besonders nützlich auf Touch-Geräten ohne Drag-Erfahrung).
- **Kein Drag zwischen Tabs.** Innerhalb der jeweiligen Liste reicht.

### Verifikation
1. Storyboard-Tab → Szene per Drag-Handle ziehen → Reihenfolge ändert sich live
2. Clips-Tab → dito; bereits generierte Clip-Vorschauen wandern korrekt mit
3. Reload → neue Reihenfolge bleibt persistent
4. Während Generierung umsortieren → fertige Clips landen bei der richtigen Szene
5. Tastatur-Test: Tab zum Drag-Handle → Space → Pfeiltaste runter → Space → Position geändert
6. Mobile/Touch: Long-Press auf Handle → ziehen funktioniert

### Risiko & Aufwand
- **Risiko: Niedrig.** Neue Library, aber gut isoliert in einem Wrapper. Bestehende Logik unverändert.
- **Aufwand:** ~15 Minuten — 1 neue Datei (SortableSceneItem), 2 Datei-Anpassungen (StoryboardTab, ClipsTab), 1 Dependency-Install.

