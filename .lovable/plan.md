## Welle 6 – Pro-Editing

Bringt den Universal Cut auf CapCut/Descript-Niveau. Fokus: schnelle Batch-Operationen, Fehler-Rückgängigmachung und Discoverability.

### 1. Ripple Delete & Magnetic Timeline
- Delete/Backspace auf einem Clip: Clip entfernen **und** alle nachfolgenden Clips auf derselben Spur nach links ziehen (Lücke schließen).
- Alt+Delete = klassisches Delete (Lücke bleibt, für User die es explizit wollen).
- Beim Verschieben eines Clips: automatisches Snapping an Nachbar-Clips (Magnet-Modus als Toggle in der Toolbar).
- Toggle-State in `localStorage` persistieren (`dc:ripple-mode`, `dc:magnet-mode`).

### 2. Multi-Select
- **Shift+Click**: Range-Select zwischen zwei Clips.
- **Ctrl/Cmd+Click**: Einzelne Clips zur Auswahl toggeln.
- **Rubber-Band-Select**: Klick+Drag auf leerem Timeline-Bereich zeichnet Auswahl-Rechteck.
- Kontextmenü und Toolbar-Buttons reagieren auf Multi-Select (Delete, Duplicate, Split, Group).
- Visuelle Anzeige: Cyan-Outline auf allen selektierten Clips + Zähler-Badge im Inspector ("3 Clips ausgewählt").

### 3. Undo/Redo-Stack
- Zentraler Command-Stack in `CapCutEditor.tsx` (History-Array mit `past` / `future`).
- Jede Mutation (Add, Delete, Trim, Move, Split, Volume-Change) pusht einen Command.
- **Ctrl+Z** = Undo, **Ctrl+Shift+Z** / **Ctrl+Y** = Redo.
- Max. 50 States (Memory-Cap).
- Toolbar-Buttons ↶ / ↷ mit disabled-State wenn Stack leer.

### 4. Keyboard-Shortcut-Overlay
- **?**-Taste öffnet Modal mit allen Shortcuts (Split S, Delete, Space=Play, J/K/L=Shuttle, Ctrl+Z, etc.).
- Suchbar, gruppiert nach Kategorie (Playback / Editing / Selection / Navigation).
- Link "Shortcuts anzeigen" im Universal-Creator Help-Menü.

### 5. Zusätzliche Shortcuts (Pro-Feel)
- **Space** = Play/Pause
- **J / K / L** = Rückwärts / Pause / Vorwärts (Shuttle)
- **← / →** = 1 Frame vor/zurück, **Shift+←/→** = 1 Sekunde
- **Home / End** = Anfang / Ende
- **I / O** = In/Out-Marker setzen (für spätere Range-Operationen)
- **Ctrl+D** = Duplicate Selection
- **Ctrl+A** = Select All

### 6. Betroffene Dateien
- `src/components/universal-creator/capcut/CapCutEditor.tsx` — History-Stack, Multi-Select-State, Global-Keyboard-Handler
- `src/components/universal-creator/capcut/CapCutTimeline.tsx` — Rubber-Band, Ripple-Logik, Shift/Ctrl-Click
- `src/components/universal-creator/capcut/CapCutToolbar.tsx` — Undo/Redo/Ripple/Magnet-Buttons
- `src/components/universal-creator/capcut/DraggableClip.tsx` — Multi-Select-Outline
- `src/components/universal-creator/capcut/ShortcutOverlay.tsx` (**neu**) — ?-Modal
- `src/hooks/useEditorHistory.ts` (**neu**) — Command-Stack-Hook
- `src/hooks/useTimelineSelection.ts` (**neu**) — Multi-Select-State

### 7. Nicht enthalten (bewusst außerhalb Welle 6)
- Speed-Ramping-UI in Timeline → eigene Welle 7 (existiert bereits im Director's Cut, muss portiert werden)
- Nested Compound Clips / Groups
- Blade-Tool mit Cursor-Wechsel (Split via S-Shortcut reicht vorerst)

### Erfolgs-Kriterium
Nutzer kann eine Sequenz von 10 Clips ohne Maus durchschneiden, unerwünschte Segmente per Ripple-Delete entfernen und den letzten Fehler mit Ctrl+Z rückgängig machen — in unter 30 Sekunden.
