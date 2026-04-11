

## Plan: Content Command Center — Hardcoded German Strings lokalisieren

### Problem
Das Content Command Center (Kalender-Seite) und ~10 zugehörige Komponenten enthalten ~80 hardcodierte deutsche Strings, die nicht auf die gewählte Sprache reagieren.

### Änderungen

**1. `src/lib/translations.ts` — Neue Keys im `calendar`-Block erweitern (alle 3 Sprachen)**

Neue Keys für alle noch fehlenden Strings:

| Key-Bereich | Beispiel-Keys (EN / DE) |
|---|---|
| Hero Header | `smartCalendar` / Smart Calendar / Intelligenter Kalender |
| Toolbar | `selectDrafts` / Select Drafts / Entwürfe wählen, `deselect` / Deselect / Abwählen, `new` / New / Neu, `manageTemplates` / Manage Templates / Vorlagen verwalten, `integrations` / Integrations / Integrationen, `addNote` / Add Note / Notiz hinzufügen, `share` / Share / Teilen |
| Metrics | `total` / Total / Gesamt, `published` / Published / Veröffentlicht, `scheduled` / Scheduled / Geplant, `eventsPerWeek` / Events/Week / Events/Woche, `avgEta` / Avg ETA / Ø ETA, `more` / More / Mehr, `less` / Less / Weniger |
| Publishing Panel | `publishQueue` / Publishing Queue / Veröffentlichungs-Warteschlange, `queued` / Queued / In Warteschlange, `failed` / Failed / Fehlgeschlagen, `noActivePublications` / No active publications, `scheduledPostsAppearHere`, `untitledPost`, `attempt` / Attempt / Versuch, `publishFailed`, `nextRetry`, `publishLogs` / Publishing Logs, `selectEvent` / Select Event |
| Quick Schedule Form | `quickSchedule` / Quick Schedule / Schnell-Planung, `createAndSchedule` / Create and schedule a post in seconds, `importedFromGenerator`, `titleOptional`, `internalTitle`, `captionPostText`, various toast messages |
| Template Builder | `editTemplate` / Edit Template, `newTemplate` / New Template, `templateName`, `description`, `category`, `chooseCategory`, `productLaunch`, `sale`, `seasonal`, `educational`, `event`, `duration`, `makePublic`, `visibleToAll`, `saving`, `update`, `create` |
| Post Timeline Builder | `postType`, `media`, `fromLibrary`, `aiGenerate`, `day`, `estimatedTime`, `title`, `briefingNotes`, `caption`, `platforms`, `deletePost`, `untitledPost` |
| Calendar Header | `syncSuccess` / Calendar synced successfully / Kalender erfolgreich synchronisiert, `syncFailed` |
| Media Library Picker | `cancel` / Cancel / Abbrechen |
| Bulk Schedule | `cancel` |
| Timeline Scheduler | `choosePlatform`, `cancel`, `noOptimalTimes` |

**2. `src/components/calendar/CalendarHeroHeader.tsx` — 2 Strings**
- "Intelligenter Kalender" → `t('calendar.smartCalendar')`
- "Events:" bleibt (oder `t('calendar.events')`)

**3. `src/components/calendar/CalendarToolbar.tsx` — ~8 Strings**
- "Entwürfe wählen", "Abwählen", "Neu", "Vorlagen verwalten", "Integrationen", "Notiz hinzufügen", "Teilen"

**4. `src/components/calendar/CalendarMetricsDashboard.tsx` — ~8 Strings**
- "Gesamt", "Veröffentlicht", "Geplant", "Events/Woche", "Ø ETA", "Mehr", "Weniger"

**5. `src/components/calendar/PublishingStatusPanel.tsx` — ~12 Strings**
- Queue labels, status badges, toast messages, date formatting (`de-DE` → dynamic)

**6. `src/components/calendar/ScheduleQuickForm.tsx` — ~10 Strings**
- "Schnell-Planung", "Erstelle und plane...", title/caption labels, toast messages, date formatting

**7. `src/components/calendar/TemplateBuilderDialog.tsx` — ~15 Strings**
- Dialog title, labels, categories, buttons, toasts

**8. `src/components/calendar/PostTimelineBuilder.tsx` — ~10 Strings**
- Labels, placeholders, button text

**9. `src/pages/Calendar.tsx` — 1 String**
- Breadcrumb: "Intelligenter Kalender" → `t('nav.calendar')`

**10. Weitere kleine Dateien** (~1-3 Strings je):
- `CalendarHeader.tsx` (toast messages)
- `MediaLibraryPickerDialog.tsx` ("Abbrechen")
- `BulkScheduleDialog.tsx` ("Abbrechen")
- `TimelineScheduler.tsx` ("Plattform wählen", "Abbrechen", toast)
- `IntegrationSettingsDialog.tsx` ("Bitte wähle zuerst...")

### Betroffene Dateien
- `src/lib/translations.ts` (add ~60 keys × 3 languages)
- `src/pages/Calendar.tsx`
- `src/components/calendar/CalendarHeroHeader.tsx`
- `src/components/calendar/CalendarToolbar.tsx`
- `src/components/calendar/CalendarMetricsDashboard.tsx`
- `src/components/calendar/PublishingStatusPanel.tsx`
- `src/components/calendar/ScheduleQuickForm.tsx`
- `src/components/calendar/TemplateBuilderDialog.tsx`
- `src/components/calendar/PostTimelineBuilder.tsx`
- `src/components/calendar/CalendarHeader.tsx`
- `src/components/calendar/MediaLibraryPickerDialog.tsx`
- `src/components/calendar/BulkScheduleDialog.tsx`
- `src/components/calendar/TimelineScheduler.tsx`
- `src/components/calendar/IntegrationSettingsDialog.tsx`

