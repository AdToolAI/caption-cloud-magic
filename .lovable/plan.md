

## Post-Loeschen in der Wochenuebersicht

### Aenderungen

| Datei | Aenderung |
|---|---|
| `src/components/dashboard/WeekDayCard.tsx` | Neuen `onDelete` Callback in Props + roter Muelleimer-Button (Trash2 Icon) neben "Bearbeiten" und "Hochladen". Bestaetigung per Klick (kein extra Dialog noetig). |
| `src/pages/Home.tsx` | `handleDeletePost` Funktion: Bei `sourceType === 'starter_plan'` den Starter-Plan-Eintrag in der DB loeschen. Bei `sourceType === 'calendar_event'` das Calendar-Event loeschen. Danach Post aus dem lokalen `weekDays` State entfernen — kein Ersatz-Post wird erstellt. |

### Verhalten
- Klick auf Loeschen-Button → Post wird aus DB entfernt (starter_week_plans oder calendar_events)
- Post verschwindet sofort aus der Wochenuebersicht
- Kein neuer Post wird generiert — der Slot bleibt leer
- Wenn alle Posts eines Tages geloescht sind, zeigt die Tageskarte "Kein Post geplant"

