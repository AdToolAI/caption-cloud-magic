---
name: v100 Auto-Reset Stale-Failed + Crash-Safe Envelope
description: compose-dialog-segments now self-heals watchdog-killed terminal state on auto-trigger and immediately failLipSync+refund on uncaught dispatch crash instead of leaving a phantom pending for 4 min
type: architecture
---

# v100 (June 2026)

## Bug pattern this fixes

User-reported on scene `07185a89-…` (4-speaker dialog):

1. First `compose-dialog-segments` dispatch wrote
   `dialog_shots = {version:5}` + `lip_sync_status=pending` +
   `twoshot_stage=master_clip`, then crashed BEFORE the first Sync.so
   submit (e.g. v99 bbox compute, face-map, plate-identity throw).
   The old top-level catch returned 500 but left the scene `pending`
   forever — no `syncso_dispatch_log` row was ever written.
2. `lipsync-watchdog` woke ~4 min later, classified the scene as
   `STALE_PREFLIGHT_MS` exceeded with `jobs=0`, called `failLipSync`
   with `reason=watchdog_preflight_aborted`, refunded credits and
   parked `dialog_shots = {status:"failed", error:"watchdog_preflight_aborted", refunded:true}`.
3. The 30 s auto-trigger in the UI kept retrying. The
   `isStaleFailedState` guard returned **409 reset_required** every
   time. User saw a permanent red "Fehler / Lip-Sync abgebrochen"
   banner and had to click "Sauber neu starten" manually.

## Schicht A — Self-Healing in the stale-failed guard

`compose-dialog-segments/index.ts` (around line 606): instead of
unconditionally returning 409, we now auto-reset the scene in-line
when ALL of these hold:

- `body?.auto === true` OR `body?.recovery === true` (auto-trigger,
  not a user-initiated manual dispatch),
- `existing.status === "failed"`,
- `existing.refunded === true` (watchdog refunded cleanly — no double
  refund risk),
- no `passes[*].status` in `{queued, rendering, retrying}` (no active
  Sync.so jobs to leak).

When satisfied, we patch the scene with `dialog_shots=null`,
`lip_sync_status="pending"`, `clip_error=null` and fall through to
the normal dispatch flow.

**Manual dispatches (`auto !== true`) still get the 409** so the
"Sauber neu starten" button stays as the explicit user-escalation
path. If the DB write fails for any reason, we fall back to the old
409 behaviour — never a worse outcome than before.

## Schicht B — Crash-safe envelope

The outer `try/catch` (line ~3169) now does three things on any
uncaught throw, *if* the dispatcher had already resolved sceneId +
userId + supabase client:

1. Log the full stack to `console.error` with prefix
   `[compose-dialog-segments] dispatch_crash`.
2. Insert a `syncso_dispatch_log` row with
   `sync_status="DISPATCH_CRASH"`, `error_class="dispatch_crash"`,
   `error_message`, and the truncated stack in `meta.stack`.
3. Call `failLipSync({ refundCredits: 0, … })` so the scene becomes
   `dialog_shots = {status:"failed", refunded:true}` immediately —
   not 4 minutes later via the watchdog.

Combined with Schicht A, this means a crash → ~30 s auto-recovery
loop instead of a 4–6 min phantom + permanent banner.

Crash-state is tracked via four module-scope-style variables
(`crashSceneId`, `crashUserId`, `crashSupabase`, `crashSyncApiKey`)
declared at the top of the handler and populated right after the
project/userId resolution. Anything that throws before that point
returns the legacy 500 (rare — only key/secret/lock issues).

## Schicht C — One-time data fix

The already-stuck scene `07185a89-6540-4d49-ab91-69e4e554d182` was
cleared via a one-off DB update (idempotent, scoped to the exact
stale signature):

```sql
update composer_scenes
   set dialog_shots = null,
       lip_sync_status = 'pending',
       clip_error = null,
       updated_at = now()
 where dialog_shots->>'status' = 'failed'
   and dialog_shots->>'error' = 'watchdog_preflight_aborted';
```

## Not changed

- `lipsync-watchdog` `STALE_PREFLIGHT_MS=4min` — still the last
  safety net for true hangs.
- v99 bbox / face-map / plate-identity logic — unchanged. If the
  underlying crash repeats, the new `dispatch_crash` log line carries
  the actual stack so we can fix the real root cause instead of
  guessing.
- Manual "Sauber neu starten" button — still works exactly as before.
- FROZEN-Invariants I.1–I.13 — unchanged.

## Files

- edited `supabase/functions/compose-dialog-segments/index.ts`
  (crash-state hoist, Schicht A auto-reset branch, Schicht B catch
  body).
- created `mem/architecture/lipsync/v100-auto-reset-and-crash-safe-envelope.md`.
