## Filter-Funktion ausbauen — Advanced Filter Panel

Aktuell zeigt der Filter-Button nur einen Toast ("Filter-Funktion kommt bald"). Ziel: ein vollwertiges, sichtbares Filter-System für den intelligenten Kalender, das in **allen Views** (Monat/Woche/Liste/Kanban/Heatmap) live wirkt — ohne den Header zu überladen.

### UX-Konzept

Statt eines simplen Dialogs bauen wir einen **inline Filter-Bar mit Chip-Logik**, der unter der Toolbar erscheint, wenn der Filter aktiv ist. Das passt zum James-Bond-2028-Design (Gold-Akzente, Glassmorphism) und ist deutlich nützlicher als ein Modal.

```text
[Toolbar: Monat Woche Liste Kanban Heatmap]  [Filter ▾] [+ Neu]
└─ wenn aktiv ─────────────────────────────────────────────────
   🔵 Status: Geplant ×   📱 Kanal: Instagram, TikTok ×   
   👤 Owner: Du ×   🏷 Tag: launch ×   [Alle löschen]  3 aktiv
```

### Filter-Dimensionen (alle Multi-Select)

1. **Status** — draft, briefing, in_progress, review, approved, scheduled, published, failed (Farb-Chips wie im Kanban)
2. **Kanal** — Instagram, TikTok, YouTube, Facebook, LinkedIn, X (mit Plattform-Icons)
3. **Owner / Assignee** — aus workspace_members
4. **Tags / Hashtags** — Freitext-Combobox aus distinct(tags) der Events
5. **Kampagne** — Dropdown aus campaigns
6. **Zeitraum-Preset** — Heute, Diese Woche, Diesen Monat, Nächste 7/30 Tage, Eigener Bereich
7. **Medien-Typ** — Bild, Video, Carousel, Text-only (aus assets_json abgeleitet)
8. **Suche** — Volltext über title + caption + brief (debounced 300ms)

### Quick-Filter-Presets (Speed-Layer)

Pills direkt in der Filter-Bar:
- "Meine Posts" → owner = current user
- "Diese Woche" → date range = current week
- "Braucht Review" → status ∈ {review}
- "Failed" → status = failed (rot pulsierend, wenn >0)
- "Drafts" → status ∈ {draft, briefing, in_progress}

Sowie **gespeicherte Filter** (max 5, in localStorage pro Workspace), z.B. "Q3-Launch IG-only".

### Architektur

**Neue Dateien**
- `src/components/calendar/filters/CalendarFilterBar.tsx` — Inline-Bar mit aktiven Chips + Quick-Presets
- `src/components/calendar/filters/CalendarFilterPopover.tsx` — Popover mit 8 Filter-Sektionen (öffnet aus dem Filter-Button der Toolbar)
- `src/components/calendar/filters/FilterChip.tsx` — Glassmorphism-Chip mit ×-Remove
- `src/components/calendar/filters/SavedFilters.tsx` — Speichern/Laden in localStorage
- `src/hooks/useCalendarFilters.ts` — State + Logik (filter object, applyFilters(events), reset, save/load)
- `src/lib/calendar/filter-engine.ts` — pure Funktion `applyFilters(events, filters): Event[]`

**Geänderte Dateien**
- `src/pages/Calendar.tsx` — `handleFilter`-Toast entfernen, `useCalendarFilters` einbinden, `filteredEvents` an Views durchreichen, `<CalendarFilterBar />` über Toolbar einblenden wenn `activeFilterCount > 0`
- `src/components/calendar/CalendarToolbar.tsx` — Filter-Button öffnet jetzt das `CalendarFilterPopover` statt `onFilter`-Callback; Badge mit aktiver Filter-Anzahl auf dem Filter-Icon
- `src/lib/translations.ts` — neue Keys für DE/EN/ES: `calendar.filters.*`

### Filter-State-Shape

```ts
type CalendarFilters = {
  search: string;
  statuses: string[];
  channels: string[];
  owners: string[];
  tags: string[];
  campaignId: string | null;
  mediaTypes: ('image' | 'video' | 'carousel' | 'text')[];
  dateRange: { from: Date | null; to: Date | null } | null;
};
```

URL-Sync via `useSearchParams` (z.B. `?status=scheduled,review&channel=instagram`) — dadurch teilbar und persistent über Reloads.

### Visuelles Verhalten

- Filter-Icon in Toolbar bekommt **gold-pulsierenden Badge** mit Zahl (analog Notification-Badge)
- Aktive Chips: gold border + cyan hover-glow (passend zu ContextSwitcher)
- "Alle löschen" rechts in der Bar, mit subtilem fade-in
- Empty-State im Kalender ändert sich zu: "Keine Posts entsprechen deinen Filtern" + Button "Filter zurücksetzen"
- Heatmap respektiert Filter (Aggregation läuft auf gefilterten Events)
- Mobile: Filter-Bar wird zur horizontal scrollbaren Pill-Row; Popover wird zum `Sheet`

### Performance

- `useMemo` für `filteredEvents` (Re-compute nur bei Filter- oder Event-Change)
- Tag-Combobox lazy-loaded aus distinct DB-Query (cached 5min via react-query)
- Search debounced 300ms

### Out of Scope (Stage 2)
- Server-seitige Filter (aktuell client-side, da Events bereits geladen sind — bei >5000 Events später nach Supabase pushen)
- Smart-Filter via AI ("zeig mir underperforming IG-Posts der letzten 2 Wochen")
- Team-shared Saved Filters (DB-backed)

### Acceptance Criteria
1. Klick auf Filter-Button öffnet Popover mit allen 8 Dimensionen (kein Toast mehr)
2. Aktive Filter erscheinen als entfernbare Chips über dem Kalender
3. Filter wirken live in allen 5 Views inkl. Heatmap
4. Quick-Presets ("Meine Posts", "Diese Woche", ...) funktionieren mit 1 Klick
5. Saved Filters lassen sich anlegen, laden, löschen (max 5)
6. Filter-State ist in URL gespiegelt und überlebt Reload
7. Mobile bleibt nutzbar (Sheet statt Popover, scrollbare Chip-Row)
8. Vollständig in DE/EN/ES lokalisiert
