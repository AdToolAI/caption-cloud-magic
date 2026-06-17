# v129.4 — Terminal Scene Aggregation Hotfix + Provider Evidence Bundle

Split into two narrow, orthogonal changes. No speculative provider containment,
no new retry/model ladder, no crop/coord changes.

## v129.4a — Terminal Scene Aggregation (behavior change)

**File:** `supabase/functions/sync-so-webhook/index.ts` + minimal guard in
`supabase/functions/lipsync-watchdog/index.ts`.

### Pass-level rule (unchanged from v128)

`provider_unknown_error` without `error_code` → `PASS_FAILED_PROVIDER_UNKNOWN`
with `error_bucket = terminal_provider_unknown_no_retry`. No retry, no
variant churn, no model fallback (already enforced by `canRetry = false`).

### Scene-level rule (new)

When a **required** pass terminalises as failed in a 3+ speaker scene
(Option A — v36 honesty policy), the webhook now:

1. Forces `sceneWillFail = true` regardless of `aliveSiblings.length` /
   `doneSiblings`. Previously the scene stayed `running` until the Watchdog
   reported `watchdog_provider_timeout` ~10 min later.
2. Re-uses the existing cancel loop to transition every non-terminal sibling
   (`pending` / `rendering` / `retrying`) to `canceled_by_scene_failure`.
   Already-terminal passes (`done` / `failed` / `canceled_by_scene_failure` /
   `done_suspect`) are left untouched.
3. Writes consistent failure fields on `composer_scenes.dialog_shots`:
   - `error` = `syncso_segments_FAILED: [error_code] An unknown error occurred — ...`
   - `last_error_class` = `provider_unknown_error`
   - `sync_error_bucket` = `terminal_provider_unknown_no_retry` (when bucket=unknown
     and message is generic; otherwise the original classification)
   - `scene_failure_source` = `sync-so-webhook`
   - `watchdog_finalized` = `false`
   - `v1294_required_pass_failure` = `true` (debug marker)
   - `lip_sync_status` = `failed`, `twoshot_stage` = `failed`, `clip_error` mirrors the same string.
4. Idempotent refund via the existing `refunded` boolean (no double-refund).

For 1- and 2-speaker scenes the existing partial-mux behaviour stays — the
single-failed-speaker should not lose the rest of the scene.

### Late-webhook guard (new)

Webhooks arriving for an already-terminal scene (`lip_sync_status === 'failed'`
or `dialog_shots.status === 'failed'`) are acked with `200 OK` and
`skipped: "ignored_due_scene_failed"`. No state mutation, no late refund,
no flip-to-done.

### Watchdog touch-up

`lipsync-watchdog` now no-ops on any row whose `lip_sync_status` ∈
{`failed`,`applied`,`canceled`} or `dialog_shots.status` ∈
{`failed`,`done`,`canceled`}. This guarantees the webhook's authoritative
failure reason is never overwritten by a generic `watchdog_provider_timeout`.

## v129.4b — Provider Input Fingerprint (telemetry only)

**File:** `supabase/functions/compose-dialog-segments/index.ts` only.

Every DISPATCHED row in `syncso_dispatch_log` now carries
`meta.provider_input_fingerprint` with:

- `model`, `sync_mode`, `dispatch_video_kind`
- `video`: `url_hash`, `duration_sec`, `width`, `height`, `fps`,
  `frame_count`, `bytes`, `content_type`
- `audio`: `url_hash`, `normalized`, `duration_sec`, `lead_in_sec`,
  `voiced_end_sec`, `peak_dbfs`, `sample_rate`, `channels`, `bits_per_sample`,
  `codec`, `bytes`
- `asd`: `auto_detect`, `frame_number`, `coordinates`, `has_bounding_boxes_url`,
  `has_bounding_boxes_inline`, `coord_in_bounds`
- `preclip_ambiguity`, `speakers`, `retry_variant`, `v1294_fingerprint`

Pure evidence for support / future Sync.so escalation. No behaviour change.

## Out of scope

- No pre-dispatch block based on "sync-3 + cut_off + preclip < ~2.6s +
  centered coords". `[360,360]` is the expected face-centered signal in a
  720×720 preclip; short preclips are common in dialog turns. Blocking them
  would create false failures.
- No safe-pad of preclip / audio.
- No new retry, model fallback, or `auto_detect` rescue.
- No change to `computeFaceCrop`, v129.1 doc-strict, v129.2.1 ambiguity guard,
  v129.3 audio normalization.

## Canary

v129.4 does **not** claim to fix Sync.so. It fixes the wrong-hanging.

If Sync.so still returns `provider_unknown_error` on the canary scene,
success means:
- Pass → `PASS_FAILED_PROVIDER_UNKNOWN`, bucket `terminal_provider_unknown_no_retry`.
- Scene → `failed` immediately, in the same webhook invocation, under `withDialogLock`.
- Pending / rendering siblings → `canceled_by_scene_failure`; no more `BUSY` poller loop.
- Refund applied exactly once (idempotent).
- `lipsync-watchdog` later sees a terminal scene and no-ops; no
  `watchdog_provider_timeout` overwrites the root cause.
- `syncso_dispatch_log` carries the new `provider_input_fingerprint`.

Verification SQL:

```sql
-- v129.4a: scene-level failure source after a terminal pass failure.
SELECT meta->>'scene_failure_source', meta->>'sync_error_bucket', count(*)
FROM syncso_dispatch_log
WHERE created_at > now() - interval '24 hours'
  AND sync_status = 'FAILED'
GROUP BY 1, 2 ORDER BY 3 DESC;

-- v129.4b: fingerprint coverage.
SELECT count(*) FILTER (WHERE meta ? 'provider_input_fingerprint') AS with_fp,
       count(*) AS total
FROM syncso_dispatch_log
WHERE created_at > now() - interval '24 hours'
  AND sync_status = 'DISPATCHED';
```
