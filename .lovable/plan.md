## v129.4 — Terminal Scene Aggregation Hotfix + Provider Evidence Bundle

Split into two narrow, orthogonal changes. No speculative provider containment, no new retry/model ladder, no crop/coord changes.

---

### v129.4a — Terminal Scene Aggregation (behavior change)

**File:** `supabase/functions/sync-so-webhook/index.ts` (only).
**Wrapped in existing `withDialogLock(scene_id)`.**

Pass-level rule (already correct, kept):
- `provider_unknown_error` without `error_code` → `PASS_FAILED_PROVIDER_UNKNOWN` with `error_bucket = terminal_provider_unknown_no_retry`. No retry, no variant churn, no model fallback.

Scene-level rule (new):
- When a **required** pass terminalises as failed (including `PASS_FAILED_PROVIDER_UNKNOWN`):
  1. Set `composer_scenes.lip_sync_status = 'failed'`, `twoshot_stage = 'failed'`.
  2. Set `dialog_shots.status = 'failed'`, `finished_at = now`.
  3. Walk `dialog_shots.passes[]` and transition every **non-terminal** sibling (`pending`, `ready`, `preclip_pending`, `queued_backoff`, `rendering`, `retrying`) to `canceled_by_scene_failure` with `finished_at = now`. Do not overwrite passes already in `done` / `failed` / `canceled_by_scene_failure` / `PASS_DONE_SUSPECT`.
  4. Issue idempotent refund (existing `refunded` flag stays the source of truth; deterministic refund key per `scene_id + attempt_id`).
- For 1- and 2-speaker scenes the existing partial-mux policy stays unchanged. The new aggregation only forces Option A (scene fails on required-pass failure) for 3+ speaker scenes — that already matches the v36 honesty policy, so this is just plugging the `provider_unknown_error` path into it.
- Late webhook for already-terminal scene → log `ignored_due_scene_failed`, return 200, no state mutation.

Watchdog touch-up (minimal):
- `lipsync-watchdog` already runs under the dialog lock. Add a guard at the top of its per-scene branch: if `lip_sync_status in ('failed','applied','canceled')` OR `dialog_shots.status in ('failed','done','canceled')`, no-op. Do **not** emit `watchdog_provider_timeout` for scenes the webhook already finalised.

Consistent error fields written on scene failure:
```
dialog_shots.error           = "syncso_segments_FAILED: An unknown error occurred"
dialog_shots.last_error_class= "provider_unknown_error"
dialog_shots.sync_error_bucket = "terminal_provider_unknown_no_retry"
dialog_shots.scene_failure_source = "sync-so-webhook"
dialog_shots.watchdog_finalized = false
clip_error                   = same string as dialog_shots.error
```

---

### v129.4b — Provider Input Fingerprint (telemetry only)

**Files:** `supabase/functions/compose-dialog-segments/index.ts` (add log) and `supabase/functions/sync-so-webhook/index.ts` (echo into FAILED dispatch log meta).

On every dispatch attempt (right before the `POST /v2/generate`), append a structured `provider_input_fingerprint` to the `syncso_dispatch_log` meta:

```json
{
  "provider_input_fingerprint": {
    "model": "sync-3",
    "sync_mode": "cut_off",
    "video": {
      "url_hash": "...", "duration_sec": 2.309,
      "width": 720, "height": 720, "fps": 30,
      "frame_count": 69, "codec": "h264"
    },
    "audio": {
      "url_hash": "...", "duration_sec": 2.249,
      "lead_in_sec": 0.10, "voiced_end_sec": 1.94,
      "rms_dbfs": -7.0, "codec": "pcm_s16le",
      "sample_rate": 44100, "channels": 1
    },
    "asd": {
      "auto_detect": false, "frame_number": 3,
      "coordinates": [360, 360], "coord_in_bounds": true
    }
  }
}
```

No behavior change. Pure evidence for a future Sync.so support bundle.

---

### Explicitly out of scope for v129.4

- No pre-dispatch block based on "sync-3 + cut_off + preclip < ~2.6s + centered coords". `[360,360]` is the expected face-centered signal in a 720×720 preclip; short preclips are normal for dialog turns. Blocking them would create false failures.
- No safe-pad of preclip / audio.
- No new retry, model fallback, or `auto_detect` rescue.
- No change to `computeFaceCrop`, v129.1 doc-strict, v129.2.1 ambiguity guard, v129.3 audio normalization.
- No State Machine, Plan-D, Segments, lipsync-2-pro, Stage 4 A/B, UI changes.

A safe-pad / sync_mode experiment is a separate later track (v129.5) and only after multiple reproducible `provider_unknown_error` cases with the same fingerprint.

---

### Canary success criteria

v129.4 does **not** claim to fix Sync.so. It fixes the wrong-hanging behavior.

If Sync.so still returns `provider_unknown_error` on the canary scene, success means:
- Pass → `PASS_FAILED_PROVIDER_UNKNOWN`, `terminal_provider_unknown_no_retry`.
- Scene → `failed` immediately, within the same webhook invocation, under `withDialogLock`.
- Pending / rendering siblings → `canceled_by_scene_failure` (no longer "alive"; no `BUSY` poller log loop).
- Refund applied exactly once (idempotent).
- `lipsync-watchdog` later sees a terminal scene and no-ops; no `watchdog_provider_timeout` overwrites the root cause.
- `syncso_dispatch_log` carries the new `provider_input_fingerprint` for support.

If Sync.so accepts: scene proceeds through the normal fan-out → audio-mux path, unchanged.

---

### Files

- `supabase/functions/sync-so-webhook/index.ts`
- `supabase/functions/lipsync-watchdog/index.ts` (terminal no-op guard only)
- `supabase/functions/compose-dialog-segments/index.ts` (fingerprint log only)
- `docs/lipsync/v129-4-terminal-scene-aggregation.md` (new)
- `mem/architecture/lipsync/v1294-terminal-scene-aggregation.md` (new)
- `mem/index.md` (one-line reference)
- `.lovable/plan.md`