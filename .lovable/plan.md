# Plan: Kanban-Board zum echten Content-Workflow ausbauen

## Status heute
`KanbanView.tsx` rendert 7 Status-Spalten (Briefing → Published) mit funktionierendem Drag&Drop, ist aber praktisch leer und nutzlos:
- Keine Karten erstellbar direkt aus dem Board (nur über "Neu"-Button oben)
- Keine WIP-Limits, keine Filter, keine Assignee-Anzeige, keine Thumbnails
- Übersetzungs-Key `calendar.dateClickHint` wird roh angezeigt
- Spalten sind nur grau, keine Bond-2028-Optik
- Nur 5 Spalten sichtbar (Scroll-Hint), letzte 2 (Scheduled/Published) versteckt
- Keine Sortierung innerhalb einer Spalte, kein Bulk-Move, kein Inline-Edit

## Ziel
Ein echtes Content-Command-Board im "James-Bond-2028"-Stil, das eine Agentur/Creator-Pipeline tatsächlich abbildet: vom Briefing bis zur Veröffentlichung — mit Quick-Create, Assignees, Thumbnails, WIP-Limits, Filtern und nahtloser Verbindung zu Studios.

## Umfang (nur Frontend, keine Schema-Änderungen)

### 1. Kanban-Spalten redesignen (Bond 2028)
- Glassmorphic-Spalten mit dezentem Gold/Cyan-Akzent pro Status (statt flacher `bg-gray-500`-Dots)
- Sticky Spaltenkopf: Titel + Count + WIP-Limit-Badge (z.B. "In Arbeit 3/5", rot wenn überschritten)
- Spaltenfarben aus `statusColors` als linker Border-Glow (vertikale Gold-Linie analog Enterprise-Pattern)
- Horizontal-Scroll mit Snap, plus Buttons links/rechts zum Durchblättern
- Leere Spalte zeigt einen kontext-passenden Empty-State ("Ziehe Karten hierher" + Icon)

### 2. Reichhaltige Post-Karten
- Thumbnail (erstes `assets_json`-Bild oder Video-Poster) als 16:9-Cover oben
- Channel-Icons (echte Lucide-/Brand-Icons statt Text-Badges)
- Assignee-Avatare (Stack, max 3) + Rest-Counter
- Geplanter Termin mit relativer Zeit ("in 3 Tagen", "überfällig" rot)
- Footer-Row: Tag-Chips, Kommentar-/Approval-Counter
- Hover: 3-Dot-Menü → Bearbeiten, Duplizieren, In Studio öffnen, Löschen
- Drag-Handle links sichtbar (Grip-Icon), Karte glüht beim Drag

### 3. Quick-Create direkt in der Spalte
- "+"-Button am Spaltenfuß → Inline-Mini-Composer (Titel + Kanäle + Datum) → erstellt Event mit dem Status der Spalte
- Re-use vom bestehenden `ScheduleQuickForm` (lockedDate optional, lockedStatus neu)

### 4. Board-Toolbar
- Filter-Chips: Mandant, Marke, Kanal, Assignee, Tag (Multi-Select)
- Suche (debounced) über Titel/Brief/Hashtags
- Sortier-Dropdown pro Spalte: Datum aufsteigend/absteigend, zuletzt geändert, manuell
- Bulk-Modus: Mehrfachauswahl → "Status ändern", "Löschen", "Veröffentlichen"
- "Spalten anpassen"-Menü: Status-Spalten ein-/ausblenden (gespeichert in `localStorage`)

### 5. WIP-Limits & Workflow-Regeln
- Pro Spalte konfigurierbares Limit (Default: Briefing ∞, In Arbeit 5, Review 5, Zur Freigabe 8, Approved ∞, Scheduled ∞, Published ∞)
- Beim Drop in volle Spalte: Warn-Toast, Drop trotzdem erlaubt (soft limit)
- Bei Drag von `published` zurück: Confirm-Dialog ("Bereits veröffentlicht — wirklich zurücksetzen?")
- Übergang in `scheduled` ohne `start_at` blockieren → öffnet `ScheduleQuickForm` automatisch

### 6. Aktivität & Verbindung zu Studios
- Karte-Click → bestehendes Day-Cockpit/Edit-Sheet (statt nur read-only)
- Kontext-Menü "In Studio öffnen" routet nach Mediatyp (Bild → Picture Studio, Video → Composer/Universal)
- "Briefing → In Arbeit"-Drop kann optional Auto-Director vorschlagen (kleiner CTA in der Karte, kein Auto-Spawn)

### 7. Fixes nebenbei
- `calendar.dateClickHint` und alle anderen Kanban-Keys in DE/EN/ES Übersetzungen vervollständigen
- Footer-Hint nur in Month/Week zeigen, nicht im Kanban
- Mobile: Spalten als horizontale Snap-Karusells, Touch-Drag via `@dnd-kit` (statt nativem HTML5-Drag, das mobil bricht)

## Technische Details
- Drag&Drop-Lib: auf `@dnd-kit/core` + `@dnd-kit/sortable` umstellen (sauberes Touch-Support, Reorder innerhalb Spalte)
- Neue Komponenten:
  - `KanbanColumn.tsx` (Header, Liste, Quick-Add-Footer)
  - `KanbanCard.tsx` (Thumbnail, Meta, Actions)
  - `KanbanToolbar.tsx` (Filter, Suche, Bulk, Spalten-Toggle)
  - `KanbanQuickAdd.tsx` (Inline-Mini-Form)
- `KanbanView.tsx` wird zum Orchestrator (State: filter, search, hiddenColumns, sortMode, bulkSelection)
- WIP-Limits + versteckte Spalten + Sort-Mode in `localStorage` unter `kanban:settings:<workspaceId>`
- Bestehende Props (`posts`, `onPostClick`, `onStatusChange`) bleiben, neue optional dazu
- Keine DB-Migration nötig — Status, Assignees, Tags, assets_json, channels existieren bereits in `calendar_events`

## Out-of-Scope (bewusst nicht jetzt)
- Custom-Status-Spalten pro Workspace (braucht DB-Spalte)
- Echte Realtime-Collab-Cursor im Board
- Swimlanes nach Mandant/Marke (kann später als View-Toggle nachgereicht werden)

## Ergebnis
Aus der heute leeren Karten-Wand wird ein produktives Pipeline-Board, auf dem Teams Content vom Briefing bis zum Live-Post in einer Ansicht sehen, sortieren, übergeben und veröffentlichen können — ohne den Calendar verlassen zu müssen.
