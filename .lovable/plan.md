Do I know what the issue is? Yes.

The pipeline was working when **every** pass — single- or multi-speaker — went through the single-face preclip with `sync-3 + auto_detect + cut_off`. Recent changes re-introduced full-plate `bbox-url-pro` paths and per-variant escape hatches. For scene `cba18767-be99-454a-95b8-939d6ad6f107` the very first dispatch was `dispatch_video_kind: full_plate` with `bounding_boxes_url` → `provider_unknown_error` in 20s, then the pass stayed in `retrying` with the dead `job_id` until the watchdog killed the scene at ~10 min. The other 3 speakers, which did go through preclip+auto_detect, all succeeded.

Goal: collapse the dispatch matrix to exactly **one** code path for N = 1..4.

## Plan

### 1. One pipeline for all speakers (the only Sync.so payload shape we send)

For every pass, regardless of N:

- Render a single-face square preclip via Remotion Lambda (existing `pass-face-preclip.ts`).
- Send the preclip to Sync.so with:
  - `model: "sync-3"`
  - `options.sync_mode: "cut_off"`
  - `options.active_speaker_detection: { auto_detect: true }`
  - no `temperature`, no `occlusion_detection_enabled`, no `bounding_boxes*`, no `coordinates`, no `frame_number`.

Remove from `compose-dialog-segments`:

- The `bbox-url-pro` / `coords-pro-box` / `coords-pro` / `sync3-coords` / `coords-pro-lp2pro` / `auto-pro` / `auto-standard` retry-variant branches that build full-plate payloads.
- The `v118_preclip_facegate_bypass` block that drops a valid preclip and routes the pass to `bbox-url-pro` when `preclip_face_count != 1`.
- The `v118_preclip_dropped_for_variant` block that drops a valid preclip when the webhook escalated to a bbox variant.
- The batch preclip "edge-speaker skip" (`status: "skip_edge"`) — edge speakers must also get preclips.
- The `v107_multispeaker_preclip_required_BLOCK` becomes "any N: preclip required or fail clean".

Remove from `sync-so-webhook`:

- The `V5_RETRY_VARIANTS` ladder. The only allowed retry is "re-render preclip and resend with the same auto_detect payload".
- The `prepareRetryFromWebhook` `coords` / bbox repair logic.

If a preclip cannot be produced after the existing v116 expansion ladder (1.0/1.4/1.8) → fail the pass cleanly and refund. No silent full-plate dispatch.

### 2. Retry must clear the dead provider state

In `sync-so-webhook`, when a pass is marked `retrying`:

- Clear `job_id`, `output_url`, `started_at`, `finished_at`.
- Clear `preclip_url` (force a fresh preclip render so a stale Lambda URL or stale face-gate result cannot wedge the retry).
- Keep `done` sibling passes untouched.

In `compose-dialog-segments` `isRetry` path: re-render the preclip if `preclip_url` is null; do not reuse the dead `job_id`.

### 3. Watchdog — recover, don't kill

In `lipsync-watchdog`:

- Treat a `retrying` pass with no live/current `job_id` as dispatchable: invoke `compose-dialog-segments` for that pass.
- Only fail the scene as `watchdog_provider_timeout` when **all** non-done passes have either truly stale `job_id`s OR are exhausted on retry budget.
- Keep current 10-minute provider TTL for live jobs (sync-3 typical runtime is under that for the short single-face preclips we send — minutes, not the 10-15 min the docs quote for a full 30s video).
- Increase only the safety-cap `STALE_HARD_MS` from 20 → 25 minutes to give the recovery one extra cycle on slow ticks. No other timeout changes.

### 4. Recover the current failed scene `cba18767-be99-454a-95b8-939d6ad6f107`

- Reset only Samuel's pass (idx 0): `status='pending'`, `job_id=null`, `output_url=null`, `preclip_url=null`, `last_error=null`, `last_error_class=null`, `retry_count=0`.
- Preserve Matthew / Kailee / Sarah as `done` with their `output_url`s.
- Scene: `lip_sync_status='running'`, `twoshot_stage='syncso_fanout_3_of_4'`, `clip_error=null`, `dialog_shots.status='rendering'`, `dialog_shots.refunded=false`, clear `dialog_shots.error` and `dialog_shots.finished_at`.

This lets the watchdog/dispatcher run only Samuel through the new unified preclip path, then trigger audio-mux when all 4 are done.

### 5. Documentation

- New `mem://architecture/lipsync/v126-unified-preclip-pipeline.md`: "All N (1..4) use single-face preclip + sync-3 + auto_detect + cut_off. Full-plate dispatch and variant ladder removed. Refund + clean fail if preclip cannot be produced."
- Update `mem://index.md` entry for sync-3 doc-strict options.

## Technical Notes

- `pass-face-preclip.ts` already handles 720p+ output and the v116 face-gate expansion ladder; no change needed.
- `sanitizeSync3Options` already strips disallowed keys; with the variant branches removed the sanitizer becomes a belt-and-suspenders check.
- `update_dialog_pass_slot` RPC stays the only write path for per-pass patches; sibling races stay safe.
- `MAX_INFLIGHT = 4` Sync.so concurrency guard, `update_dialog_pass_slot`, audio-mux dispatch, refund logic — all unchanged.

## Validation

- DB: next `syncso_dispatch_log` rows for any new pass must have `meta.dispatch_video_kind='preclip'`, `meta.payload_summary.options.active_speaker_detection.auto_detect=true`, no `bounding_boxes_url`, no `bounding_boxes`, no `coordinates`.
- Scene `cba18767…` finishes (`lip_sync_status='applied'`, `clip_url` set) within ~3-5 minutes after Samuel re-dispatch.
- No `provider_unknown_error` retries on a pass that still has a valid preclip.