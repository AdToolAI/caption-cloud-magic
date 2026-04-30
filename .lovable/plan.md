# Plan: Die übrigen 11 QA-Missions auf interaktive Steps upgraden

Die Step-Engine (`browserlessClient.ts`) und der Executor unterstützen jetzt `navigate`, `click`, `click_text`, `fill`, `wait_for`, `expect_visible`, `expect_no_console_error` und `sleep`. Vorbild sind die bereits aufgerüsteten Missions `smoke-02-picture-studio-mock` und `smoke-03-ai-video-toolkit`.

Aktueller Stand in `qa_missions`:
- **Bereits interaktiv (3):** `smoke-01-dashboard-tour`, `smoke-02-picture-studio-mock`, `smoke-02-secondary-tour`, `smoke-03-ai-video-toolkit`, `smoke-12-news-hub`
- **Nur Navigate (8):** `smoke-04` … `smoke-11`

## Was passiert

Eine einzige SQL-Migration aktualisiert die `steps`-JSON-Spalte für die 8 reinen Navigate-Missions plus eine kleine Anreicherung von `smoke-12-news-hub`. Die `mock_mode`-Flag bleibt überall `true`, damit keine Provider-Credits verbrannt werden.

## Step-Muster pro Mission

Alle Missions folgen demselben Pattern:
```text
navigate -> expect_visible (Page-Title) -> expect_no_console_error
  -> click_text / fill (1-2 echte Interaktionen) -> sleep
  -> expect_visible (Folgezustand) -> expect_no_console_error
```

| Mission | Route | Interaktion (Stufe 2 Smoke) |
|---|---|---|
| `smoke-04-directors-cut-load` | `/universal-directors-cut` | Timeline lädt → Klick auf "Subtitles"-Tab → erwarte Subtitle-Editor |
| `smoke-05-composer-render-stitch` | `/video-composer` | Erwarte Scene-Grid → Klick "Add Scene" → erwarte Scene-Card |
| `smoke-06-autopilot-briefing` | `/autopilot` | Klick "New Briefing" → fülle Topic-Input → erwarte "Generate"-Button |
| `smoke-07-calendar-crud` | `/calendar` | Klick "+ Event" → erwarte Dialog → Klick "Cancel" |
| `smoke-08-music-studio` | `/music-studio` | Klick Genre-Chip "Cinematic" → fülle Prompt → erwarte "Generate" |
| `smoke-09-marketplace` | `/marketplace` | Erwarte Character-Grid → Klick erstes Character-Card → erwarte Detail-Sheet |
| `smoke-10-brand-characters` | `/brand-characters` | Klick "New Character" → erwarte Upload-Dialog |
| `smoke-11-avatars-talking-head` | `/avatars` | Klick "Talking Head" → erwarte Voice-Picker |
| `smoke-12-news-hub` | `/news-hub` → `/trend-radar` | Erwarte Article-Card auf beiden Routen + console-error-checks |

## Lieferung

Eine Datei: `supabase/migrations/<timestamp>_upgrade_qa_missions_interactive.sql` mit `UPDATE qa_missions SET steps = '...'::jsonb WHERE name = '...'` für 9 Missions. Keine Code-Änderungen, keine Edge-Function-Deploys nötig.

## Verifikation

1. Migration läuft.
2. Manueller Trigger über Cockpit oder `qa-agent-orchestrator` mit `mission_id` für 1-2 Missions.
3. In `qa_test_runs` prüfen: alle Steps `passed`, keine workflow-Bugs erzeugt — oder echte UI-Bugs (Selektor fehlt, Button-Label gewandert) als Findings sichtbar.

## Nicht-Ziele

- Keine Mock-Handler in den AI-Edge-Functions (`replicate-generate-video` etc.) — das ist der getrennte nächste Schritt.
- Keine neuen Missions für Magic Edit / Email Director / Ad Director — kommt im Coverage-Schritt danach.
- Keine Änderung an `expect_no_console_error`-Logik (delta-Errors-Refactor bleibt offen).
