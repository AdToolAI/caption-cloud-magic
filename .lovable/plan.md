Do I know what the issue is? Yes.

The currently failed scene `f03cdc20-cc7b-48e2-9175-f54f2b8456ed` failed before any Sync.so job was dispatched. The database and logs show:

- `clip_error = plate_probe_failed_3plus_speakers`
- `syncso_dispatch_log.sync_status = PREFLIGHT_BLOCKED`
- `error_message = probeMp4Dims returned null for 3+ speaker scene`
- Edge log: `probe-result ... phaseA=http_206+nomoov phaseB=http_206+nomoov phaseC=http_206+notkhd dims=null`

So the v33 hard-preflight is doing what we added: it blocks 3-speaker Sync.so dispatch when it cannot determine the actual video plate dimensions. The problem is that our MP4 dimension probe is not robust enough for the Hailuo-hosted MP4 layout, so it false-fails even though the clip is visibly valid and ready.

## Plan

1. Fix the MP4 dimension probe
   - Extend `probeMp4Dims` in `_shared/twoshot-face-map.ts` so it does not rely only on `tkhd` discovery.
   - Add additional MP4 parsing fallbacks:
     - scan/parse visual sample entries (`avc1`, `avc3`, `hvc1`, `hev1`) for width/height,
     - reuse the existing `probeMp4Stream` width/height logic where suitable,
     - log which probe path succeeded.
   - Keep the hard-fail for real unknown dimensions, but stop false-blocking valid Hailuo clips.

2. Add a safe 3-speaker fallback when the anchor and clip aspect match
   - If MP4 probing still fails but `audio_plan.twoshot.faceMap.width/height` is present and has a sane video aspect ratio, use those dimensions as `trusted_anchor_dims_fallback`.
   - Only allow this fallback for matching wide scene plates, not arbitrary portrait/talking-head sources.
   - Record the fallback source in dispatch logs so we can tell whether the scene used exact MP4 dims or anchor-derived dims.

3. Fix the reset path so failed preflight scenes can actually start fresh
   - Update `reset-lipsync-scene` to clear the stale `audio_plan.twoshot.faceMap` / preflight cache fields when doing a full lip-sync reset.
   - Keep the master clip intact unless the failure says the clip itself is unusable.
   - This prevents “Sauber neu starten” from reusing a bad cached geometry map forever.

4. Improve user-visible error handling
   - Treat `plate_probe_failed_3plus_speakers` as a recoverable technical preflight failure in the UI copy.
   - Make the message say the system could not read video geometry and will retry after reset, instead of implying Sync.so failed.

5. Validation after implementation
   - Deploy the changed edge functions.
   - Re-run the affected scene through `compose-dialog-segments` and confirm it gets past preflight into `DISPATCHED` instead of `PREFLIGHT_BLOCKED`.
   - Check logs for real dimensions or the explicit trusted fallback.
   - Confirm the watchdog no longer shows `scanned=0` for a scene that should be running.

## Files to change

- `supabase/functions/_shared/twoshot-face-map.ts`
- `supabase/functions/compose-dialog-segments/index.ts`
- `supabase/functions/reset-lipsync-scene/index.ts`
- optionally `src/hooks/useTwoShotAutoTrigger.ts` or the progress/error component if the hard-fail copy is surfaced there

## Important note

This is separate from the earlier Sync.so `unknown error` loop. That loop appears stopped for the current scene. The current blocker is our own preflight geometry reader falsely failing on a valid 3-character Hailuo plate.