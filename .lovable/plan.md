# Universal Creator — Wizard springt nach Render auf Step 2 (Clean-Fix)

## Root Cause

Zwei Zustandsmaschinen kollidieren auf **einer** Spalte:

- Der Wizard nutzt `content_projects.status = 'draft'` als **Wiederaufnahme-Signal** ("dieses Projekt ist noch in Bearbeitung").
- `render-with-remotion` überschreibt genau dieselbe Spalte mit `'rendering'`, sobald ein Render startet (`supabase/functions/render-with-remotion/index.ts:483–489`).
- Auto-Resume filtert hart auf `.eq('status', 'draft')` (`src/pages/UniversalCreator/UniversalCreator.tsx:383`).

Folge: Nach Render-Start ist das Projekt für Auto-Resume unsichtbar. Sobald die Seite neu mountet (Reload, Tab-Wechsel mit `visibilitychange`-Auth-Refresh, Menü-Navigation zurück ohne `?project=…`), fällt der Wizard auf localStorage/Defaults zurück → optisch "wieder in Step 2".

Die schnelle Lösung (Filter aufweichen) kaschiert nur das Symptom. Sauber ist es, die beiden Lifecycles zu **trennen**.

## Clean-Fix — Trennung von Editier- und Render-Lifecycle

### 1. Neue Semantik für `content_projects.status`

Nur noch **Wizard-Lifecycle**:

- `draft` — vom User bearbeitbar
- `archived` — vom User explizit "fertig / weglegen"

Render-Status verschwindet aus dieser Spalte. Er lebt bereits vollständig in `video_renders` (`status`, `video_url`, `error_message`) und wird per Realtime beobachtet — es gibt keinen fachlichen Grund, ihn zu duplizieren.

### 2. `render-with-remotion` Edge-Function

- **Entfernen:** `update({ status: 'rendering', … })` auf `content_projects`.
- **Behalten:** `render_engine`-Feld darf einmalig gesetzt werden (informativ, kein Lifecycle).
- Wenn Telemetrie gewünscht ist, ein optionales Feld `last_render_started_at` hinzufügen — beeinflusst kein Resume-Verhalten.

### 3. Auto-Resume vereinfachen

`src/pages/UniversalCreator/UniversalCreator.tsx`:

- Filter bleibt `.eq('status', 'draft')` — jetzt aber semantisch korrekt, weil kein Backend den Status mehr wegzieht.
- Zusätzliche Defensive: **`?project=<id>` ist die Primärquelle**. Wenn der URL-Param existiert, wird immer `hydrateFromDb` mit dieser ID benutzt, unabhängig vom Status. (Ist heute schon so — bleibt.)

### 4. `saveProgress` beim Sprung nach Step 5 synchronisieren

Kleiner Bonus, damit ein Reload während des Renders deterministisch auf Step 5 landet:

- In `goToNext()` **vor** `setCurrentStep(next)` einmal `await saveProgress()`, wenn `next === n.length - 1` (Preview & Export).
- Verhindert die 500 ms Debounce-Lücke zwischen Klick "Weiter → Preview" und dem tatsächlichen DB-Schreiben von `current_step = 4`.

### 5. Migration / Backfill

Ein SQL-Migrationsschritt, der Alt-Datensätze bereinigt:

```sql
update public.content_projects
set status = 'draft'
where content_type = 'universal'
  and status in ('rendering', 'completed');
```

Grund: Diese Zeilen wurden vom alten Code fälschlich aus dem Draft-Pool entfernt und würden sonst nach dem Fix nicht wieder auftauchen.

### 6. Kein Change nötig

- `PreviewExportStep.tsx` — Render-Flow ist korrekt.
- `video_renders`-Tabelle und Realtime-Handler — bleiben unverändert.
- localStorage-Backup — bleibt als Second-Line-Fallback.

## Technische Details

Betroffene Dateien:

- `supabase/functions/render-with-remotion/index.ts` (Update-Statement entfernen)
- `src/pages/UniversalCreator/UniversalCreator.tsx` (`goToNext` await, Kommentar an Auto-Resume)
- Neue Migration `supabase/migrations/<ts>_content_projects_status_cleanup.sql`

Keine Änderung am Schema von `content_projects` (Spalten bleiben). Keine Änderung am `video_renders`-Contract. Keine breaking changes für andere Consumer, die `content_projects.status` lesen — die haben nach dem Backfill wieder konsistente Werte.

## Verifikation

- Manuell: Projekt bis Step 5 ausfüllen → "Render" klicken → Reload während Render läuft → erwartet: bleibt auf Step 5, Render-Job wird per Realtime weiterverfolgt.
- Manuell: Render fertig → in ein anderes Tool wechseln → zurück auf `/universal-creator` → erwartet: Auto-Resume lädt Projekt auf Step 5 mit "completed"-Job.
- Manuell: `handleNewProject()` klicken → altes Projekt wird nicht überschrieben (URL-Reset schützt bereits, unverändert).
- SQL-Check nach Backfill: `select status, count(*) from content_projects where content_type = 'universal' group by 1` — nur noch `draft` / `archived`.
