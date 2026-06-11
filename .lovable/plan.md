Problem observed from live data:

- The scene `07185a89-6540-4d49-ab91-69e4e554d182` is marked `lip_sync_status=done` and all 4 Sync.so jobs returned `done`.
- The user-visible output still has closed mouths, so this is not a failed-job problem; it is a silent no-op from the provider/output path.
- The current dispatch code sends single-face preclips with `active_speaker_detection: { auto_detect: true }`. That contradicts the existing v99 rule that edge/static preclips need explicit crop-local bounding boxes to prevent silent no-op.

Plan:

1. Restore deterministic preclip targeting
   - In `compose-dialog-segments`, for every `usePassPreclip` dispatch, compute the speaker face box in crop-local 512×512 coordinates from `preclip_crop` plus the face map / plate bbox.
   - Send `active_speaker_detection: { auto_detect: false, bounding_boxes: [...] }` for the preclip path.
   - Keep the current safer temperature `0.5` to avoid the earlier provider-error pattern tied to hard-coded `temperature: 1.0`.

2. Add dispatch telemetry that proves what Sync.so actually received
   - Store a compact payload summary in `syncso_dispatch_log.meta` for successful dispatches too: dispatched video kind (`preclip` vs `full_plate`), actual video URL tail, model, sync mode, ASD mode, frame count, crop, and bbox.
   - This prevents future confusion where logs currently show the original plate URL even when the payload may have used the preclip.

3. Add a no-op quality gate after completed jobs
   - In the webhook/poll completion path, compare a lightweight mouth-region/frame-diff signal between the input preclip and output pass.
   - If all/most movement is below threshold, do not mark the pass as clean `done`; trigger a retry variant with explicit bbox / alternate model instead of producing a final closed-mouth render.

4. Reset the affected scene for clean regeneration
   - Clear only this scene’s completed no-op lip-sync state (`dialog_shots`, `lip_sync_status`, `twoshot_stage`, `clip_error`) so the existing auto-trigger regenerates all four passes with the corrected dispatch.

5. Verification
   - Confirm new `syncso_dispatch_log` rows show `video_kind=preclip` and `asd_mode=preclip_bbox` for all 4 speakers.
   - Confirm all 4 passes finish and the final mux URL updates.
   - If the no-op gate flags any pass, inspect that pass and let the retry ladder continue rather than accepting a closed-mouth output.