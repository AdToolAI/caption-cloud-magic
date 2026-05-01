## Problem

Der Live Sweep läuft alle 12 Provider **synchron in einer einzigen Edge-Function-Invocation** durch:

- Stable Audio: bis zu 180s timeout
- Hailuo, Kling, Runway, Hedra: je 30-90s real
- Summe locker > 150s → **Supabase Edge Idle-Timeout (150s) → 504 IDLE_TIMEOUT**

Auch wenn jeder einzelne Provider erfolgreich antwortet, kann der HTTP-Response des Sweeps nie zurückkehren → die UI sieht "Edge function returned 504" und wertet den ganzen Run als Fehler, obwohl im Hintergrund evtl. schon Provider-Rows in `qa_live_runs` geschrieben wurden.

## Lösung: Sweep in Background-Worker auslagern

Das Pattern ist Standard für lange Sweeps in Supabase: Request kehrt sofort zurück, Verarbeitung läuft in `EdgeRuntime.waitUntil` weiter, Frontend pollt den Status.

### Phase 1 — `qa-live-sweep` zerlegen

**HTTP-Handler (synchron, < 1s):**
1. Auth + Admin-Check (wie bisher)
2. Budget-Reset (`spent_eur = 0`)
3. `sweep_id` generieren, `getTestAssets`, optionalen HeyGen-Bootstrap *einmal* triggern
4. Für alle 12 Provider direkt **`pending`-Rows** in `qa_live_runs` insert (status `pending`, nicht `running`) — damit das Frontend sofort weiß, dass alle 12 unterwegs sind
5. `EdgeRuntime.waitUntil(runSweep(sweepId, …))` starten
6. **Sofort 202** zurückgeben mit `{ sweep_id, total: 12, status: "running" }`

**Background-Worker (`runSweep`):**
- Iteriert sequentiell über die 12 Provider (gleiche Logik wie bisher)
- Updated jeweils die existierende `pending`-Row auf `running` → `succeeded`/`failed`/`expected`/`skipped_budget`
- Schreibt am Ende eine **Summary-Row** in eine neue Mini-Tabelle `qa_live_sweep_summary` (oder reuse `qa_live_budget` mit `last_summary jsonb`) mit `{ sweep_id, completed_at, totals }`
- Catch-all: Bei Worker-Crash schreibt `failure`-Status auf alle noch offenen Rows

### Phase 2 — Frontend (`LiveSweepTab.tsx`) auf Polling umstellen

- Beim Klick auf "Run Live Sweep": `invoke('qa-live-sweep')` → erwartet 202 + `sweep_id`
- Sofort `useQuery` mit `refetchInterval: 3000` auf `qa_live_runs.where(sweep_id = …)` starten
- Live-Update der UI: zeigt für jeden Provider den Status (pending → running → succeeded/failed/expected/skipped_budget)
- Polling stoppen, sobald **alle 12 Rows einen Endstatus haben** (oder nach 10 Min Hard-Stop mit Warnung)
- Toast/Summary ziehen wir aus dem aggregierten Endstand der Rows (nicht mehr aus dem Sweep-Response)
- Re-Klick "Run Live Sweep" während aktivem Sweep → Button disabled mit Hint "Sweep läuft (8/12 fertig)"

### Phase 3 — Robustheit

- **Watchdog**: Eine zusätzliche Spalte `started_at` auf `qa_live_runs`. Wenn eine Row > 5min in `running` hängt (Worker abgestürzt), kennzeichnet das Frontend sie visuell als "stale" und der nächste Sweep darf sie überschreiben.
- **Per-Sweep Idempotenz**: Wenn binnen 30s zweimal "Run Sweep" geklickt wird, prüft der Handler erst `qa_live_runs.where(status in (pending, running)).count()` und gibt `409 Conflict` zurück mit existierender `sweep_id`.
- **Logs**: `console.log` Marker `[sweep ${sweepId}] start/end/provider:${name}` für leichteres Debugging via `edge_function_logs`.

## Erwartetes Ergebnis

- Klick auf "Run Live Sweep" → UI zeigt sofort 12 Provider-Cards in `pending`
- Über die nächsten ~5-8 Min füllen sich die Cards live mit Ergebnissen
- Kein 504 mehr, weil der HTTP-Request in < 1s endet
- Hedra und Runway bekommen wieder ihre vollen 60-90s Zeit, ohne dass der Sweep platzt
- Summary erscheint, sobald die letzte Row final ist

## Geänderte Dateien

- `supabase/functions/qa-live-sweep/index.ts` — Split in Sync-Handler + `EdgeRuntime.waitUntil(runSweep)`
- `src/pages/admin/LiveSweepTab.tsx` — Polling-basiertes UI statt Wait-for-Response
- Migration: `qa_live_runs.started_at timestamptz`, evtl. neue `qa_live_sweep_summary`-Tabelle (oder `qa_live_budget.last_summary jsonb`)
- `mem://features/qa-agent/architecture` — Async-Sweep-Pattern dokumentieren

Soll ich loslegen?
