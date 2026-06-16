# Alpha-Plan v3.1 — Sync.so Pipeline Hardening (Implementierungsvertrag)

**Implementierungsvertrag (nicht verhandelbar):**
> Ein terminaler Pass bleibt terminal. Jeder neue Dispatch nach Terminalzustand braucht eine neue `attempt_id` und eine explizite User-Aktion.

**Status:** v2 verworfen, v3 freigegeben, v3.1 = Implementierungsbasis für v128.

---

## Stage 1 (v128) — Terminal-Outcome-Hardening

### 1.1 Terminal-Outcome-Taxonomie

| Webhook/Polling-Signal | Status | Badge | Auto-Refund | Mutiert dialog_passes? |
|---|---|---|---|---|
| `sync_completed` (valide) | `PASS_DONE` | grün | nein | ja |
| `sync_completed_noop` | `PASS_DONE_SUSPECT` | gelb | **nein** | ja |
| `provider_unknown_error` | `PASS_FAILED_PROVIDER_UNKNOWN` | rot | ja | ja |
| `watchdog_provider_timeout` | `PASS_FAILED_TIMEOUT` | rot | ja | ja |
| `provider_failed` / `rejected` | `PASS_FAILED_PROVIDER` | rot | ja | ja |
| `429` / `rate_limited` | `QUEUED_BACKOFF` (nicht-terminal) | gelb | nein | ja |
| `stale_webhook` (Korrektur 1) | **log-only Event** | — | nein | **nein** |

`PASS_FAILED_QUALITY_CONFIRMED` ist als Status reserviert, wird in v128 **nur manuell/Admin** gesetzt (siehe Stage 3.5).

### 1.2 Alle Recycle-Pfade schließen

In v128 entfernt/deaktiviert:

- **Webhook NOOP-Recovery** (`sync-so-webhook/index.ts` L486–538) → entfernen
- **Webhook FAILED-Retry-Ladder** für `provider_unknown_error` (L1055–1070) → entfernen
- **D6 Plan-D fan-out** → **komplett deaktiviert (Entscheidung 1)**, Feature-Flag `FEATURE_PLAN_D_FANOUT=false`; falls Pfad doch erreicht wird: log `PLAN_D_FANOUT_BLOCKED_V128`, kein Dispatch
- **D7 Watchdog** → kein direkter Sync.so-Dispatch mehr (siehe 1.4)
- **v87 Coord-Refresh-Reset** (L2125–2131) → siehe 1.8

### 1.3 Source of Truth + Log-Alias

- **Operativ:** `composer_scenes.dialog_passes[passIdx]`
- **Forensik:** `syncso_dispatch_log`

Jeder Dispatch ab v128 schreibt `syncso_dispatch_log.meta`:

```json
{
  "variant": "...",
  "retry_variant": "...",
  "model": "...",
  "payload_hash": "...",
  "pass_idx": 0,
  "attempt_id": "...",
  "provider_job_id": "...",
  "dispatch_source": "d1-compose | webhook | watchdog | user-retry"
}
```

CI-Check `meta.variant != NULL` gilt nur für `created_at >= v128_deployed_at`. Legacy 87 Rows bleiben unangefasst.

### 1.4 Scene-Level Lock + Watchdog-Reduktion (Entscheidung 2)

`withDialogLock(scene_id)` verbindlich überall, wo `composer_scenes` mutiert oder dispatch-relevant gelesen wird.

**Watchdog (`poll-dialog-shots`) ab v128 darf nur noch:**

1. Unter Scene-Lock terminale Timeouts setzen:
   - `DISPATCHED`/`PROCESSING` mit `expired provider deadline` → `PASS_FAILED_TIMEOUT` + idempotenter Auto-Refund
2. Nicht-terminale Kandidaten an D1 übergeben:
   - `pending`/`ready`/`preclip_pending`/`queued_backoff` → invoke `compose-dialog-segments`
   - **Kein direkter POST zu Sync.so aus dem Watchdog**

**Watchdog darf niemals anfassen:** `PASS_DONE`, `PASS_DONE_SUSPECT`, `PASS_FAILED_*`.

**Zielbild:**
- D1 = einziger aktiver Dispatch-Pfad
- Watchdog = Health-Checker + Timeout-Marker + D1-Invoker
- Webhook = Result-Writer unter Scene-Lock

Webhook (`sync-so-webhook`): `withDialogLock` ist bereits importiert, ab v128 verbindlich aufgerufen für alle `composer_scenes.dialog_shots`-Writes.

### 1.5 Circuit-Breaker zeitlich scopen

```sql
WHERE syncso_dispatch_log.created_at > composer_scenes.last_reset_at
```

Fallback: `scene.created_at`. `run_id`/`generation_session_id` ist out-of-scope für v128 (Stage 5).

### 1.6 Auto-Refund

**Triggert bei:** `PASS_FAILED_PROVIDER_UNKNOWN`, `PASS_FAILED_TIMEOUT`, `PASS_FAILED_PROVIDER`.
**Nicht bei:** `PASS_DONE_SUSPECT`, `QUEUED_BACKOFF`.
Idempotent via deterministische UUID aus `(scene_id, pass_idx, attempt_id)`.

### 1.7 User-Retry-Mechanik

UI-Button auf jedem terminalen Pass (`PASS_DONE_SUSPECT`, `PASS_FAILED_*`):
- erzeugt neue `attempt_id`
- bucht Credits erneut
- setzt Pass auf `pending` mit `previous_attempt_id` archiviert
- **einziger** legaler Weg, einen terminalen Pass zu verlassen

### 1.8 v87 Coord-Refresh-Härtung

**Erlaubt** (Coord-Update + ggf. Status bleibt nicht-terminal):
- `pass.status ∈ {pending, ready, preclip_pending, queued_backoff}`
- UND `pass.active_provider_job_id == null`

**Verboten** für `PASS_DONE`/`PASS_DONE_SUSPECT`/`PASS_FAILED_*`:
- Status bleibt unverändert
- Neue Coords landen in `pass.candidate_coords` + `candidate_coords_at`
- Warning-Event `dispatch_source = 'coord-refresh-skipped'`
- Gelber Admin-Badge "new coords detected after terminal pass"

### 1.9 Terminal Transition Guard (Korrektur 2)

`PASS_* → pending/retrying/dispatched` ist nur erlaubt, wenn ALLE Bedingungen erfüllt:

```
user_retry_flag == true
AND new_attempt_id != previous_attempt_id
AND credit_charge_result == success
AND active_provider_job_id == null
```

Implementierung:
- Zentrale `transitionPass(scene_id, pass_idx, from, to, context)` Helper-Funktion
- **Keine direkten Status-Writes außerhalb dieser Funktion** (lint-rule + Code-Review)
- Illegale Transition → Block + Sentry P1 + log `ILLEGAL_TERMINAL_TRANSITION_BLOCKED`

DB-Trigger auf JSONB optional, falls Aufwand gerechtfertigt. Minimum: zentrale Helper-Funktion + Sentry P1.

### 1.10 Stale Webhook Handling (Korrektur 1)

```
if webhook.attempt_id !== current_attempt_id:
  insert syncso_dispatch_log event 'STALE_WEBHOOK_IGNORED'
  return 200
  # composer_scenes.dialog_passes wird NICHT mutiert
```

`IGNORE_STALE_WEBHOOK` ist kein Pass-Status, sondern reines Log-Event.

---

## Exit-Kriterien Stage 1 (48h Produktion)

- **0** `(pass_idx, attempt_id)`-Kombinationen mit mehr als einem `provider_job_id`
- **0** Übergänge `PASS_* → pending/retrying/dispatched` ohne User-Retry-Flag
- **0** Writes auf `composer_scenes` aus dispatch-relevanten Pfaden außerhalb `withDialogLock`
- **0** Coord-Refresh-Resets auf terminale Passes
- **0** direkte Sync.so-POSTs aus Watchdog
- **0** Mutationen auf `dialog_passes` durch Stale-Webhooks
- **0** Sentry P1 `ILLEGAL_TERMINAL_TRANSITION_BLOCKED`
- **100%** neuer `syncso_dispatch_log`-Rows mit `meta.variant`, `meta.model`, `meta.attempt_id`, `meta.pass_idx`

---

## Reihenfolge

1. **v3.1-Freigabe** (dieser Plan)
2. **Stage 1 / v128** — Implementierung
3. **Stage 2+3** — Observability + Admin-Cockpit (neue Terminal-States, gelbe Badges, Retry-Button)
4. **Stage 3.5** — CONFIRMED-NOOP-Validator (Phase 1 Admin-Review, Phase 2 dry-run Telemetrie, Phase 3 ggf. Auto-Promotion) — **nicht in v128** (Entscheidung 3)
5. **Stage 4** — A/B-Test sync-3 vs lipsync-2-pro (~€9, 30 Renders), erst nach 48h grünem v128
6. **Stage 5** — `run_id`/`generation_session_id` + `SYNC_SO_MAX_INFLIGHT` als Env (nicht hardcoden)
7. **Stage 6** — Pass-Level Lock + Performance-Tuning

---

## Out-of-Scope für v128

- Pass-Level Lock (Stage 6)
- `run_id`/`generation_session_id` first-class (Stage 5)
- `SYNC_SO_MAX_INFLIGHT` Env-Konfiguration (Stage 5)
- CONFIRMED-NOOP-Auto-Promotion (Stage 3.5)
- `lipsync-2-pro` Produktions-Migration (Stage 4)
- Bulk-Backfill der 87 Legacy `syncso_dispatch_log`-Rows
- Reaktivierung D6 Plan-D fan-out (architektonisch verworfen)
