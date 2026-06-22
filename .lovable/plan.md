## Plan

### Diagnosis
- The database shows affected scenes have `dialog_shots.total_passes = 4`, but `dialog_shots.passes` contains only one element: pass 0.
- Logs confirm pass 1–3 self-invocations start (`DISPATCH_ATTEMPT_STARTED`) but never reach `DISPATCHED`.
- Root cause: the current v168 per-slot write only persists `passes[0]` on the first dispatch. The subsequent root merge intentionally strips `passes`, so the full pass skeleton is never stored. When fan-out calls `{ advance: true, pass_idx: 1/2/3 }`, those calls load `prevState.passes.length === 1`, conclude the requested pass does not exist, and skip silently.

### Fix
1. **Patch `compose-dialog-segments` state persistence**
   - In the successful Sync.so dispatch block, keep the existing per-slot RPC behavior for advance/retry.
   - For a fresh multi-pass dispatch (`!isAdvance && !isRetry && passes.length > 1`), initialize every pass slot before fan-out:
     - pass 0: full rendering/job patch
     - pass 1..N: pending skeletons with correct `idx`, `speaker_idx`, `character_id`, `audio_url`, `coords`, `segments`, etc.
   - Use the existing `update_dialog_pass_slot` RPC for each slot so no new schema migration is required.
   - Keep `update_dialog_shots_root_merge` for root fields, but ensure the full `passes[]` array exists before fan-out begins.

2. **Preserve v169 parallel behavior**
   - Leave per-pass locks, 429 backoff, stale-job reconcile, and webhook fan-in unchanged.
   - Keep the current fan-out loop; once the full pass skeleton is persisted, pass 1–3 self-invokes can dispatch normally.

3. **Improve observability for this failure mode**
   - Add a clear log when the fresh dispatcher initializes `N` pass slots.
   - Add a clear log when an advance call skips because the requested pass index is missing, so future “1/1” regressions are visible in dispatch logs.

4. **Deploy and verify**
   - Deploy `compose-dialog-segments`.
   - Start a clean new 4-speaker scene.
   - Verify DB and logs show:
     - `jsonb_array_length(dialog_shots->'passes') = 4` immediately after pass 0 dispatch
     - `DISPATCHED` rows for pass_idx `0,1,2,3`
     - UI progresses as `1/4`, `2/4`, `3/4`, `4/4`, then `audio_muxing`

### Expected result
- Four-speaker lip-sync no longer collapses to `1/1`.
- Each speaker gets its own pass slot and Sync.so job.
- The first character no longer appears as the only processed speaker across all short clips.