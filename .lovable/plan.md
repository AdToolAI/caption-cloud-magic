# Intelligent Calendar – Visual Level-Up & Bug-Sweep

Ziel: Den kompletten Kalender (`/calendar`) optisch auf James-Bond-2028-Niveau heben (Glasmorphismus, Gold/Cyan-Akzente, gestufte Tiefe, sanfte Motion) – **ohne irgendeine Funktion zu verändern oder zu entfernen**. Parallel ein gezielter Bug-Sweep der bestehenden Flows.

## Was du auf dem Screenshot siehst (Ist-Zustand)

- Hero "Content Command Center" wirkt isoliert, große leere Mitte.
- Toolbar-Reihe (Monat/Woche/Liste/Kanban/Heatmap + Entwürfe + Neu + Filter) sitzt auf flachem Hintergrund, keine Tiefe.
- "Gespeicherte Filter:"-Chips wirken wie Debug-Labels.
- Monatsraster: nahezu identische tiefschwarze Zellen, kein Wochentag-Rhythmus, kein "Heute"-Glow, nur ein `+` rechts oben.
- Keine visuelle Dichte-Hierarchie (leerer Tag vs. Tag mit 5 Posts sieht gleich aus).

## Visual Upgrade (rein presentational)

### 1. Calendar Shell & Hintergrund
- Neuer Aurora/Spotlight-Background-Layer hinter dem gesamten Kalender (radialer Gold→Cyan Gradient, sehr subtil, `pointer-events-none`, fixed in der Page).
- Outer Card mit echtem Glasmorphismus: `bg-card/40 backdrop-blur-2xl`, doppelter Border (Gold-Hairline + Inner-Cyan-Glow), `shadow-[0_30px_80px_-20px_hsla(43,90%,68%,0.15)]`.

### 2. Hero Header (`CalendarHeroHeader`)
- "Intelligenter Kalender"-Chip → animierter Gradient-Pulse-Ring.
- Titel "Content Command Center" → Playfair Display, Gold-zu-Weiß Gradient-Text, dezente Letterspacing-Animation beim Mount.
- Rechts: Events-Counter als animiertes Ring-Badge (Framer Motion `useSpring` zählt hoch) + Mini-Sparkline der nächsten 14 Tage (read-only, zeigt vorhandene `posts`).
- Untertitel-Zeile mit Live-Status-Pills: "X scheduled · Y in review · Z published" (Daten kommen bereits aus `posts`, keine neue Query).

### 3. Toolbar (`CalendarToolbar`)
- Segmented Control für Views (Monat/Woche/Liste/Kanban/Heatmap) mit gleitendem Gold-Indikator (`layoutId` Motion), Icons + Label, aktiver Zustand mit Cyan-Glow.
- "Neu"-Button → Premium-Gradient + Icon-Microinteraction (Plus rotiert 90° on hover).
- Filter-Button: Badge mit Active-Count, glüht wenn aktiv.
- Kebab-Menü bekommt Icon-Refresh und Hover-Tooltips.

### 4. Filter-Bar (`CalendarFilterBar`)
- "Gespeicherte Filter"-Label → kleines Caps-Eyebrow mit Gold-Diamond-Bullet.
- Preset-Chips: Pill-Shape mit Glass-Backdrop, Hover lift + Glow in Status-Akzentfarbe (Meine Posts=Cyan, Review=Amber, Failed=Red, Drafts=Gold).
- Active-Filter-Chips bleiben funktional, bekommen aber smooth `AnimatePresence` enter/exit.

### 5. Monatsansicht (`MonthView`) – das Herzstück
- Wochentag-Header: kleine Caps, Gold-Hairline darunter, Wochenend-Tage in gedämpftem Cyan.
- Tageszellen:
  - Glass-Karten mit `rounded-2xl`, Border `border-white/5`, Hover `border-primary/40` + leichter Lift (`y: -2`).
  - **Heute**: Gold-Doppelring + sanfter Pulse-Glow + kleines "TODAY"-Eyebrow.
  - **Außerhalb des Monats**: 30% Opacity statt fast unsichtbar – bleibt sichtbar aber klar sekundär.
  - **Dichte-Indikator**: dünner Akzentbalken am linken Rand der Zelle, Höhe = #Posts (max 4 Stufen). Farbe nach dominantem Status.
  - Datums-Zahl: Tabular-Nums, größere Display-Font.
  - `+`-Button nur on hover sichtbar (saubereres Grid), Tap immer möglich.
- Post-Chips in den Zellen: Platform-Gradient bleibt, aber kompakter (h-5, truncate, Status-Dot links, Plattform-Icon rechts), Stack mit "+N mehr"-Pill in Gold.
- Monatsnavigation: Pfeil-Buttons mit Hover-Glow, Monatstitel mit Jahres-Suffix in muted-Style.

### 6. Wochen-/Listen-/Kanban-/Heatmap-Views (leichtere Politur)
- **WeekView**: Zeitachse links als Gold-Gradient-Line, aktuelle Uhrzeit als Cyan-Glow-Line (NOW-Indikator), Tagesspalten als Glass-Lanes.
- **ListView**: Gruppierung pro Tag mit Sticky-Header + Gold-Hairline, Status-Pills in Akzentfarben.
- **KanbanView**: Spalten als Glass-Lanes mit Status-Akzent-Top-Border, Karten mit dezenter Tilt-Animation beim Drag.
- **HeatmapView**: bereits visuell stark – nur Legende und Card-Frame an neues Design anpassen.

### 7. Empty-State
- Glas-Karte mit animiertem Kalender-Icon (Gold-Pulse), CTA "Ersten Post erstellen" in Premium-Gradient.

### 8. Motion-Regeln
- Page-Mount: staggered Fade-Up (Header → Toolbar → Filter → Grid, 60 ms Versatz).
- View-Switch: `AnimatePresence` Cross-Fade zwischen Views (200 ms).
- Hover-States: 150 ms ease-out, keine bouncenden Springs in dichten Grids (Performance).

## Bug-Sweep (parallel, read-only Audit, dann Fixes)

Ich prüfe gezielt diese Flows live im Preview und korrigiere nur tatsächlich gefundene Bugs:

1. **View-Switch & Persistenz** – `localStorage` `calendar-view` lädt korrekt, alle 5 Views rendern ohne Console-Error.
2. **Filter-Engine** – jeder Filter-Typ (search, statuses, channels, owners, tags, mediaTypes, dateRange) verkleinert `filteredEvents` korrekt; Reset stellt alle Events wieder her; Saved Filters laden/löschen.
3. **Filter-Presets** – "Meine Posts" (mit & ohne `user.id`), "Diese Woche" (Mo-So-Range korrekt), "Braucht Review", "Drafts", "Failed".
4. **Context Switcher** – Workspace/Mandant/Brand-Wechsel triggert Reload der Events, Filter resetten nicht ungewollt.
5. **Event-CRUD** – Neu erstellen, anklicken (Detail-Dialog), Drawer öffnen, Status ändern, Drag&Drop in MonthView (`onPostMove`).
6. **Modals** – AutoSchedule, CampaignTemplate, Holiday, Integration, BulkSchedule, Recurring, DayCockpit öffnen/schließen sauber, keine z-index Konflikte mit neuem Glass-Layer.
7. **Header-Counter** – `Events: 0` reagiert auf Filter (zeigt gefilterte vs. total).
8. **Mobile Viewport** (`useIsMobile`) – Toolbar wrapped, Filter-Popover → Sheet, Monatsraster scrollbar.
9. **i18n** – DE/EN/ES Keys für alle neuen visuellen Labels ("TODAY", Tooltips).
10. **Console & Network** – nach Bug-Sweep: keine roten Errors, keine 4xx/5xx auf Calendar-Queries.

Gefundene Bugs werden in einem kurzen Report aufgelistet und im selben Build gefixt (minimal-invasiv).

## Geänderte Dateien (geplant)

**Neu**
- `src/components/calendar/CalendarBackgroundAurora.tsx` – Hintergrund-Layer
- `src/components/calendar/SegmentedViewSwitcher.tsx` – animierter View-Switch (ersetzt 5 lose Buttons in Toolbar)
- `src/components/calendar/DayCellPremium.tsx` – wiederverwendbare Glass-Tageszelle (von MonthView konsumiert)

**Edits (rein optisch, gleiche Props/API)**
- `src/pages/Calendar.tsx` – Aurora einhängen, Shell-Glas, Stagger-Mount
- `src/components/calendar/CalendarHeroHeader.tsx` – neuer Hero
- `src/components/calendar/CalendarToolbar.tsx` – Segmented Control + Polish
- `src/components/calendar/filters/CalendarFilterBar.tsx` – Chip-Polish, AnimatePresence
- `src/components/calendar/views/MonthView.tsx` – nutzt `DayCellPremium`, neuer Header
- `src/components/calendar/views/WeekView.tsx` – Glass-Lanes, NOW-Indikator
- `src/components/calendar/views/ListView.tsx` – Sticky-Day-Header
- `src/components/calendar/views/KanbanView.tsx` – Lane-Polish
- `src/components/calendar/views/HeatmapView.tsx` – Frame-Anpassung
- `src/components/calendar/CalendarEmptyState.tsx` – Premium-Empty
- `src/index.css` – ggf. 1–2 neue Utility-Tokens (Aurora-Gradient, NOW-Line-Color)

## Out of Scope (explizit nicht angefasst)

- Datenmodell, Edge Functions, RLS, Hooks (`useCalendarFilters`, `usePostingTimes`, etc.) – nur visuelle Konsumenten ändern sich
- Filter-Logik (`filter-engine.ts`) – bleibt 1:1
- Drag-&-Drop-Mechanik – nur Animations-Layer dazu
- Neue Features (AI-Vorschläge, Smart-Sorting etc.) – separater Auftrag

## Acceptance Criteria

1. Kalender wirkt visuell wie aus einem Bond-Cockpit (Glas, Gold, Cyan, Tiefe) – matched Design-System.
2. Alle bestehenden Funktionen verhalten sich identisch (Klick-Targets, Tastatur, Modals).
3. "Heute"-Zelle ist sofort erkennbar; Tage mit Posts haben sichtbare Dichte-Hierarchie.
4. View-Switch animiert weich, keine Layout-Shifts > 50 ms.
5. Bug-Report wird mitgeliefert; alle gefundenen Bugs gefixt oder explizit als out-of-scope markiert.
6. Mobile (<768 px) bleibt voll bedienbar.
7. Keine neuen Console-Errors, kein Performance-Regress bei 100+ Events im Monat.
