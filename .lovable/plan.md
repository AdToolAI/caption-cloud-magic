# v431 G3.1b — Antwort auf die drei Rückfragen + Restschluss vor Deploy

## 1. poll-dialog-shots — belegt, kein Matrix-Eintrag nötig

Die Funktion existiert nicht mehr. Belege:

- `supabase/functions/` enthält kein `poll-dialog-shots` (517 Funktionen geprüft).
- `mem/architecture/lipsync/v70-legacy-removal.md`: „Deletes the legacy per-turn v4 dispatcher …
  `supabase/functions/poll-dialog-shots/` (per-turn v4/v5+shots[] dispatcher)".
- `sync-so-webhook/index.ts` (v70-Block, Zeile ~1845): Legacy-v4-Szenen werden mit
  `legacy_v4_ignored` 200 beantwortet, „`poll-dialog-shots` is no longer fanned out
  (function deleted)".
- `src/hooks/useTwoShotAutoTrigger.ts`: dispatcht ausschließlich `compose-dialog-segments`.

Es gibt heute also keinen Poller-eigenen Provider-Re-Dispatch. Jeder Re-Dispatch läuft über
`sync-so-webhook`, `lipsync-watchdog` oder `render-sync-segments-audio-mux` — alle drei stehen
in der Matrix. Der Bericht wird um genau diesen Beleg ergänzt (statt eines Matrix-Eintrags).

## 2. DB-Smokes — noch nicht vollständig grün gelaufen

Grün und belegt ist bisher nur die **Acquire-Concurrency** (parallel → 1× `acquired`,
2× `already_in_flight`) sowie die RPC-Security (`REVOKE PUBLIC`, nur `service_role`).
Die übrigen vereinbarten Smokes wurden noch nicht als Suite ausgeführt. Sie werden vor dem
Deploy als **eine transaktionale Migration mit `RAISE EXCEPTION`-Rollback** gefahren, gleiche
Mechanik wie G2.3/G2.4, und nur die Resultate berichtet:

| # | Smoke | Erwartung |
|---|---|---|
| D1 | `plate_generation` NULL beim INSERT | Abbruch (`check_violation`) |
| D2 | `plate_generation` / `created_at` UPDATE | Trigger blockt, Werte unverändert |
| D3 | Acquire-Concurrency | 1× `acquired`, N−1× `already_in_flight` (erneut, im Suite-Lauf) |
| D4 | Replace-Concurrency | genau 1 Gewinner, Verlierer `null`; alt `stale` + `replaced_by`, neu `attempt_no+1` |
| D5 | RPC-Security | `anon`/`authenticated` → permission denied |
| D6 | Reaper | `dispatch_uncertain`, `completed_at IS NULL`, Callback-Lookup über `pipeline_job_id` findet Job weiter |
| D7 | Predecessor `succeeded` | `already_completed`, kein neuer Attempt |
| D8 | Predecessor `stale` | `retry_superseded`, kein neuer Zweig |
| D9 | Predecessor `failed`, **gespeicherter** Failure-/Error-Code in `RETRYABLE_FAILURE_REASONS` | Replace, `attempt_no+1` |
| D10 | Predecessor `failed`, gespeicherter Code außerhalb der Liste — auch bei „gutem" Caller-`retry_reason` | `failure_not_retryable`, kein Attempt |
| D11 | Acquire bei terminalem Vorgänger | `predecessor_exists`, kein INSERT |

**Autorisierung liegt in der DB.** Die Retryfähigkeit wird ausschließlich im gelockten
`composer_replace_pipeline_attempt` anhand des am Vorgänger **gespeicherten** Failure-/Error-Codes
gegen die geschlossene Menge `RETRYABLE_FAILURE_REASONS` entschieden (SQL-seitige Konstante,
spiegelbildlich zur TS-Liste, per Test abgeglichen). Ein vom Caller übergebenes `retry_reason`
wird nur protokolliert und autorisiert nichts. D9/D10 prüfen genau dieses DB-Enforcement.



## 3. lipsync-watchdog — Formulierung war zu schwach, wird korrigiert

Zwei reale Lücken (im Code verifiziert):

- `lipsync-watchdog` ruft `compose-dialog-segments` an zwei Stellen (Advance-Fan-out,
  Dispatch-Recovery) **ohne** Retry-Kontext auf. Dort greift heute Initial-Akquise.
- `composer_acquire_pipeline_attempt` prüft nur auf einen **aktiven** Attempt
  (`pending|dispatching|dispatched|dispatch_uncertain`). Bei terminalem Vorgänger
  (`succeeded`, `failed`, `stale`) legt es weiterhin `attempt_no+1` an — also genau der
  beanstandete Initial-Acquire trotz existierendem Vorgänger.

Korrektur (Identität = Scene/Run/Stage/Segment/Generation):

1. **DB:** `composer_acquire_pipeline_attempt` bekommt vor dem INSERT eine
   Existenzprüfung über **alle** Attempts dieser Identität, unabhängig vom Status.
   - aktiver Attempt → `already_in_flight` (wie bisher),
   - terminaler Attempt (`succeeded`/`failed`/`stale`) → neues Verdikt
     `predecessor_exists`, **kein** INSERT.
   - Damit erzeugt Acquire strukturell nie Attempt > 1; Attempt > 1 entsteht
     ausschließlich über `composer_replace_pipeline_attempt`.
2. **Client (`_shared/v431-ledger.ts`):** `acquireLedgerJob()` mappt `predecessor_exists`
   auf ein eigenes Ergebnis; `resolveLedgerDispatch()` ohne Retry-Kontext gibt dann
   `skip: predecessor_requires_retry_context` zurück (kein Dispatch, kein Attempt).
3. **`lipsync-watchdog`:** beide Re-Dispatch-Stellen ermitteln den letzten Attempt der
   Identität aus `composer_pipeline_jobs` und senden
   `retry_of_pipeline_job_id` + `retry_reason: "watchdog_stalled"` mit. Existiert kein
   einziger Attempt, bleibt es Initial-Akquise. Der Predecessor-Vertrag entscheidet dann:
   `succeeded` → No-op, `stale` → `retry_superseded`, `failed` → nur bei geschlossenem
   retryfähigem Grund, aktiv → `already_in_flight`.

Sprachlich im Bericht und in `docs/v427-run-contract.md`: „Initial-Akquise gilt nur, wenn für
diese Identität **überhaupt kein** Attempt existiert" — nicht „kein dispatchter Job".

## Verifikation vor Deploy

- Smoke-Suite D1–D10 grün (plus neuer Fall: Acquire bei terminalem Vorgänger →
  `predecessor_exists`, kein INSERT).
- Vertragstests: Watchdog-Advance und Watchdog-Recovery senden Retry-Kontext; ohne
  vorhandenen Attempt Initial-Akquise; `acquireLedgerJob` erzeugt nie Attempt > 1.
- Frozen-Suite `npx vitest run src/lib/composer src/lib/video-composer` gegen 536,
  `tsgo --noEmit`, `deno check` der berührten Funktionen.

## Danach

Deploy-GO-Vorlage → Drain-Fenster → Post-Deploy `missing_binding=0`, `job_not_found=0`,
`wrong_job=0` → Bericht → STOP. `binding_pending` bleibt Messwert,
`stale_run`/`stale_generation` diagnostisch, kein G3.2 während des Drains.
