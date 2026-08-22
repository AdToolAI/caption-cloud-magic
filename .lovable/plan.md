# V441 — Terminalization Contract Fix + Watchdog Escalation + Frontend Publish

Closes the live P1 found on S11 (`e658509d`, run `03f62e08`, generation 7): the provider
finished all passes, but the webhook's write is rejected by the database, so four passes
stay `rendering` and the watchdog re-forwards the same rejected result every minute.

## Confirmed evidence (live, read-only)

- `sync-so-webhook` logs: motion gate `verdict=indeterminate` (delta_mean 9.79 / 10.86,
  between `noop=3.68` and `motion=15.41`) → apply called with
  `writeId="ssw:failed"`, `providerStatus="COMPLETED"`, `outputUrl=null`
  → `g322_apply … verdict=rejected reason=write_id_mismatch`.
- The RPC matrix (`composer_apply_sync_segment_result`) only accepts `ssw:failed` for
  `provider_status ∈ (FAILED, REJECTED, CANCELED)` **and** `output_url IS NULL`.
  The `ssw:noop_fail` / `ssw:noop_escalate` branch already accepts
  `COMPLETED + output_url NULL` — exactly the shape this path produces.
- `lipsync-watchdog` logs: `polled … status=COMPLETED → forwarded`, then
  `scanned=1 polled=4 advanced=0 failed=0`, once per minute for ~20 minutes.
- Watchdog escalation is suppressed by design in this situation: the
  `watchdog_provider_timeout` branch is skipped whenever `polledThisTick` is true, and
  polling succeeds on every tick. Only the 25-minute `STALE_HARD_MS` branch can ever
  break the loop — a whole-scene hard fail, not a pass-level terminalization.
- Production bundle `assets/js/index.CRrrFFh3.js` contains none of the V438 state
  literals (`plate_queued`, `plate_rendering`, `plate_failed`, `lipsync_muxing`), so the
  V438/V440 frontend is not served yet. The 99 % bar is old code, not a browser cache.

## Scope — exactly three changes

### 1. Webhook write contract (root cause)

In `supabase/functions/sync-so-webhook/index.ts`, the multi-speaker fail-closed
`indeterminate` branch (~line 1402) currently emits `ssw:failed` with
`providerStatus:"COMPLETED"`. Route it through the write-id the matrix already accepts
for a completed provider with no usable output — `ssw:noop_fail` — keeping
`errorText: "motion_probe_indeterminate"` so the reason stays visible in the ledger and
the existing refund/scene-verdict handling of that path applies.

Audit the sibling fail-closed emitters for the same defect and fix them consistently:
- speaker-cardinality indeterminate (`_shared/fa4-speaker-cardinality.ts`, webhook ~1103)
- `_shared/fa4-lock-phase-orchestration.ts` `fail_closed` write id
- webhook line ~1604 (real provider failure path — verify it always carries a genuine
  FAILED/REJECTED/CANCELED status; leave it alone if it does)

No change to the database matrix: the RPC is the contract, the callers were wrong.

### 2. Watchdog hard terminalization for repeated apply rejection

In `supabase/functions/lipsync-watchdog/index.ts`:
- Make `pollAndForward` report whether the forwarded callback was actually **applied**
  (the webhook response already distinguishes applied vs. rejected/skipped), instead of
  only whether the provider status was terminal.
- Treat a forward that returns a non-applied verdict as *no progress*: it must not set
  `polledThisTick` for the suppression check, so the existing
  `watchdog_provider_timeout` escalation can fire.
- Add an explicit pass-level cap: a `sync_segment` job that has been `dispatched` for
  more than 10 minutes and produced repeated non-applied verdicts is terminalized as
  failed with the standard refund/cleanup path (`failLipSync`), instead of being
  re-forwarded forever.

### 3. Publish the frontend

After 1 and 2 are green, publish so the already-implemented V438/V440 progress contract
(current-generation plate authority, clips-epoch progress floor reset) is actually
served. This is what removes the stuck 99 % bar.

## Explicitly out of scope

- No new Samuel render is triggered as part of this gate.
- No change to the frozen lip-sync processing chain (preclip → plate → sync → mask → mux).
- No change to motion thresholds or calibration authority — `indeterminate` stays
  fail-closed; only the *write shape* of that outcome is corrected.
- No manual DB surgery on the currently stuck run; once the fix is deployed the watchdog
  terminalizes it on its own (or the existing 25-minute hard cap does).

## Verification

- Unit/contract tests: extend `supabase/functions/_shared/fa4-v405-matrix.test.ts`
  (case D currently asserts the *wrong* mapping — it pins `ssw:failed` for
  indeterminate) and add a guard test that no caller may emit `ssw:failed` together with
  `providerStatus="COMPLETED"`.
- Deploy `sync-so-webhook` and `lipsync-watchdog` only.
- Read logs for the next watchdog ticks on S11: expect `g322_apply … verdict=applied`
  (or a terminal `failed` with refund) instead of `reason=write_id_mismatch`, and the
  scene leaving `lip_sync_status=running`.
- Confirm the newly served bundle contains the V438 state literals.
