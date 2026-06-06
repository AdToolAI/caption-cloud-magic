Do I know what the issue is? Yes.

The backend logs show the new 4-speaker scene reached Sync.so pass 4/4 and the final dialog-stitch render completed successfully. The red “Lip-Sync abgebrochen” in the screenshot is therefore very likely a false frontend failure state triggered while the long multi-speaker run was still active. Separately, the v72 mux change has a real timing risk: it makes short per-speaker preclips span the whole scene, so those clips can play at the wrong time or stress Remotion. Also, the Lambda renderer log still shows the old Remotion bundle canary, so the new `masterImageUrl` behavior may not actually be active in Lambda yet.

Plan:

1. Fix the false “abgebrochen” progress state
   - Update `usePipelineProgress.ts` so lipsync is not marked as stalled/failed while there is active backend evidence:
     - `lipSyncStatus` is `running` or `audio_muxing`
     - `twoshotStage` is an active stage like `master_clip`, `syncso_*`, `audio_muxing`, `preflight`, `deferred`, `circuit_open`
     - `dialog_shots.status` is non-terminal
     - a current Sync.so job id or mux render id exists
   - Increase or bypass the 4-minute stall threshold for multi-speaker lipsync, because 4 speakers can legitimately take longer than 4 minutes.
   - Ensure a completed lipsync scene clears stale frontend failure/stall state immediately.

2. Correct the v72 mux logic
   - Keep the static anchor master image for multi-speaker scenes.
   - Revert the “always-on preclip overlay” part for tight per-speaker Sync.so clips.
   - Use the static anchor as the always-visible resting face layer, and overlay each lipsynced crop only during its actual speaker turn.
   - Preserve the old behavior for single-speaker scenes.

3. Add mux safety guards
   - Before using `masterImageUrl`, verify the anchor URL is present and plausible; otherwise fall back to video master.
   - Keep dispatch idempotency unchanged so no duplicate mux renders are started.
   - Make failure messages distinguish Sync.so failure vs final mux/render failure.

4. Refresh the final scene without rerunning Sync.so
   - After the code change, clear only the audio-mux state for the affected scene and re-trigger the mux step.
   - Do not rerun the 4 Sync.so speaker passes and do not charge again.

5. Verify
   - Check logs for `fanout-4-speakers-static` and one successful `dialog-stitch` webhook.
   - Confirm the scene ends as `lip_sync_status='done'`, `twoshot_stage='done'`, no `clip_error`.
   - Confirm the UI no longer shows “Lip-Sync abgebrochen” during an active multi-speaker run.

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>