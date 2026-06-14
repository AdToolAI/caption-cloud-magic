---
name: v120 Lipsync Zombie-Failsafe + Pass-4 Preclip-Forcing
description: After 2 silent `bbox-url-pro provider_unknown_error` fails per pass, compose-dialog-segments forces the single-face preclip path; sync-so-webhook discounts stale `retrying` siblings (>8min) so the scene can fail terminally; lipsync-watchdog adds a 12-min zombie guard that fails any v5 fan-out scene with no live rendering pass and ≥2 recent FAILED dispatches.
type: feature
---

# v120 — Lipsync Zombie-Failsafe + Pass-4 Preclip-Forcing

## Problem (scene ec4290f2-d555-4a3c-af44-9413e467fd2f)
- Pass 4 (Sarah) repeatedly failed Sync.so `bbox-url-pro` with `provider_unknown_error` (no `error_code`) on a 4-speaker plate while Passes 2/3 succeeded via the single-face preclip path.
- The v118 pass-circuit-breaker (5 fails) did fire eventually, but Pass 1 (Samuel) was still in `retrying` with `rc < MAX_V5_RETRIES`, so `aliveSiblings>0` blocked `sceneWillFail` in the webhook. Scene only failed after the 20-min hard watchdog.

## Fix
### 1. `compose-dialog-segments` — Pass-4 Preclip-Forcing
Before each pass dispatch, count `syncso_dispatch_log` rows for `(scene_id, pass_idx, retry_variant='bbox-url-pro', sync_status='FAILED', error_class='provider_unknown_error')`. When `>=2`:
- Set `v120ForcePreclip=true`, clear cached `preclip_url/render_id/crop` so the renderer rebuilds.
- `freshDefaultVariant` skips `bbox-url-pro` (forces `coords-pro` + preclip path).
- `skipPreclipForEdgeSpeaker` is disabled (we explicitly want the preclip).

### 2. `sync-so-webhook` — Discount stale `retrying` siblings
`aliveSiblings` filter also treats `retrying` passes as dead when `started_at > 8min ago`. Prevents zombie scenes blocked by ghost siblings that were never re-dispatched.

### 3. `lipsync-watchdog` — 12-min zombie guard
New condition before the 20-min hard timeout: for v5 fan-out scenes age >12min, if no pass is `rendering` with a live `job_id` (<10min old) AND `syncso_dispatch_log` has ≥2 FAILED rows in the last 5min → fail with `v120_zombie_no_live_pass` + refund.

## Files
- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/sync-so-webhook/index.ts`
- `supabase/functions/lipsync-watchdog/index.ts`
