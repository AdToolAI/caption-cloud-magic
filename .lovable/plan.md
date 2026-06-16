# Alpha-Plan v128 — Phase B (Architectural Hardening)

**Zentraler Satz:** Erst wenn Lock + Transition-Guard + Watchdog-Reduktion drin sind, ist v128 wirklich stabilisierend.

Phase A (NOOP→SUSPECT, FAILED-Ladder weg, Coord-Refresh-Guard) ist deployed. Phase B schließt die strukturellen Lücken, die Stage 0.5 aufgedeckt hat: Webhook ohne Lock, Watchdog kann racen, Plan-D ist ein zweiter Dispatch-Pfad, Terminal-Transitions sind nicht zentral abgesichert.

## A2-Klarstellung (bestätigt, vor B1 verifizieren)

`PASS_FAILED_PROVIDER_UNKNOWN` ist **pass-terminal**, nicht automatisch **scene-fatal**.
- Pass wird terminal failed, Refund idempotent.
- Scene läuft mit Fallback / rotem Badge weiter, sofern ein Fallback existiert.
- Scene wird nur dann global abgebrochen, wenn es bewusst keinen Scene-Fallback gibt (z. B. Single-Pass-Scene ohne Alternative).

Verifikation in `sync-so-webhook` + `compose-dialog-segments`: nach Pass-Fail wird `scene.status` nur dann auf `failed` gesetzt, wenn alle Passes terminal failed sind ODER kein Fallback definiert ist. Sonst bleibt Scene in `degraded` / `partial`.

## Reihenfolge (strikt sequentiell)

### B1 — Transition-Helper / Terminal-Guard

Zentraler `transitionPass(passIdx, fromStatus, toStatus, ctx)` Helper in `supabase/functions/_shared/dialogPassTransition.ts`.

**Erlaubt:**
- `pending → dispatched → done | failed_* | done_suspect`
- `queued_backoff → dispatched`
- Jede terminale → terminale Transition ist **blockiert**.
- Jede terminale → non-terminale Transition (`pending`, `retrying`, `dispatched`) erfordert:
  - `ctx.user_retry_flag === true`
  - `ctx.new_attempt_id !== currentPass.attempt_id`
  - `ctx.credit_charge_result === 'success'`
  - `currentPass.active_provider_job_id == null`

**Bei Verstoß:** Sentry P1 `ILLEGAL_TERMINAL_TRANSITION_BLOCKED` + `syncso_dispatch_log` Event + return ohne Mutation.

Alle Pass-Status-Writes in `sync-so-webhook`, `compose-dialog-segments`, `compose-dialog-scene`, `poll-dialog-shots`, Watchdog müssen über diesen Helper laufen.

### B2 — withDialogLock im sync-so-webhook

`sync-so-webhook` darf `composer_scenes.dialog_passes` nur noch unter `withDialogLock(scene_id)` lesen+schreiben.

- Lock-Acquire vor SoT-Read.
- Pass-Mutation + `dialog_shots`-Update unter demselben Lock.
- Lock-Timeout: 10s; bei Timeout → 503 retry für Sync.so-Webhook (Sync.so retried).
- `dialog_dispatch_locks` Tabelle existiert bereits.

### B3 — Watchdog-Reduktion

`poll-dialog-shots` (pg_cron) darf **nicht mehr direkt Sync.so dispatchen**.

Erlaubt unter `withDialogLock`:
- Setzt `PASS_FAILED_TIMEOUT` (terminal) für Passes mit `dispatched_at < now() - 8min` und `provider_job_id` ohne Webhook-Antwort.
- Für `pending` / `queued_backoff` Passes: invoke `compose-dialog-scene` (D1), kein direkter POST.

Verboten:
- Direkter `fetch('https://api.sync.so/...')`.
- Touch auf `PASS_DONE`, `PASS_DONE_SUSPECT`, `PASS_FAILED_*`.

### B4 — Plan-D-Fanout per Flag komplett deaktivieren

`FEATURE_PLAN_D_FANOUT=false` als Env-Var in `compose-dialog-scene`.

- Code-Pfad bleibt erhalten (für spätere Re-Aktivierung), aber Guard `if (!FEATURE_PLAN_D_FANOUT) return;` vor Fan-out.
- Bei jedem unterdrückten Fan-out: `syncso_dispatch_log` Event `PLAN_D_FANOUT_BLOCKED_V128` mit `scene_id`, `pass_idx`, `reason`.

## UI-Begleitung (parallel, nicht-blockierend)

- **PASS_DONE_SUSPECT Badge:** gelb, sichtbar, Tooltip "Provider returned without lip motion — review manually". Sofort umsetzen, sonst silent degraded.
- **User-Retry-Button:** **hidden / feature-flagged** bis alle Vorbedingungen erfüllt sind:
  - `attempt_id` first-class
  - Credit-Charge idempotent
  - Transition-Guard aktiv (= B1 deployed)
  - Garantierte neue `attempt_id`
  - `active_provider_job_id == null`
- Bis dahin: Badge zeigt "Contact support to retry" o.ä.

## Exit-Kriterien Phase B (24h Beobachtung nach Deploy)

- `0` `PASS_* → pending/retrying/dispatched` ohne `user_retry_flag`
- `0` `(pass_idx, attempt_id)` mit >1 `provider_job_id`
- `0` Webhook-Writes auf `composer_scenes` außerhalb `withDialogLock`
- `0` Watchdog-Re-Dispatches auf terminale Passes
- `0` Plan-D-Fanout-Dispatches (nur `PLAN_D_FANOUT_BLOCKED_V128` Events)
- `100%` neue `syncso_dispatch_log` Rows mit `meta.variant`, `meta.model`, `meta.attempt_id`, `meta.pass_idx`
- `0` Sentry P1 `ILLEGAL_TERMINAL_TRANSITION_BLOCKED`

## Out-of-Scope (explizit nicht in Phase B)

- Stage 4 A/B-Test
- Speed/Parallelisierung
- Segments-Refactor
- Model-Wechsel (lipsync-2-pro)
- Confirmed-NOOP-Automatik / Validator (Stage 3.5)
- User-Retry-Button Aktivierung (separater Folge-PR nach Bedingungserfüllung)

## Reihenfolge global

v128 Phase A ✅ → **v128 Phase B (jetzt)** → 24h Observe → Stage 2+3 → Stage 3.5 → Stage 4 A/B → Stage 5 → Stage 6

## Betroffene Files

- `supabase/functions/_shared/dialogPassTransition.ts` (neu, B1)
- `supabase/functions/_shared/withDialogLock.ts` (existiert, in Webhook einziehen, B2)
- `supabase/functions/sync-so-webhook/index.ts` (B1 + B2)
- `supabase/functions/compose-dialog-segments/index.ts` (B1)
- `supabase/functions/compose-dialog-scene/index.ts` (B1 + B4)
- `supabase/functions/poll-dialog-shots/index.ts` (B1 + B3)
- `src/components/composer/.../DialogPassBadge.tsx` (UI, SUSPECT-Badge)
- `docs/lipsync/v128-implementation.md` (Update Phase-B-Status)
