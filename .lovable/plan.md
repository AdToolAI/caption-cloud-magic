## Diagnose

Looked at the last dialog scene `0145fdc4…b276` (4 speakers). For each turn Sync.so returned an output, but turns 2 (Matthew) and 4 (Sarah) carry `sync_noop_suspect: true` / `noop_reason: "sync_output_reencoded_passthrough_suspect"` — Sync.so re-encoded the preclip without actually moving the mouth.

Common factor for the two bad turns:
- Very short voiced audio (Matthew: 0.46s voiced inside a 1.09s preclip; Sarah: 1.46s voiced)
- Both still dispatched with `active_speaker_detection: { auto_detect: true }` — even though they were tagged `retry_variant: "coords-pro"`.

That's the bug introduced together with the v129.24 fix: the "preclip is unambiguous → force `auto_detect: true`" rule we added in `compose-dialog-segments` runs **before** the retry-variant check, so the `coords-pro` fallback never actually sends coordinates. Every attempt for turns 2/4 ended up being the same auto-detect call that Sync-3 silently no-ops on short outer-edge crops, and the muxer accepted the noop output as the final clip.

Turns 1 & 3 look identical in payload shape but had longer voiced segments (≥2.3s on a near-square crop), so Sync-3 happened to detect motion and produced real lipsync. That matches what you see in the video.

## Plan

### 1. Honor `coords-pro` retry variant in `compose-dialog-segments`

In the dispatch builder, evaluate retry-variant **before** the "preclip unambiguous → auto_detect" branch:
- When `retry_variant === "coords-pro"` and we have valid `_v1291.transformed_coords_int` + `frame_number` (both already computed for every turn): build the payload with
  ```ts
  active_speaker_detection: {
    auto_detect: false,
    coordinates: [x, y],
    frame_number: f,
  }
  ```
  and tag `asd_mode = "coords_pro_preclip_v12925"`.
- Mirror the same precedence in the v129.1 payload-contract preflight so it doesn't strip the coords back out.

The first preclip pass still uses `auto_detect: true` for clean preclips (keeps the v129.24 fix for the original `generation_unknown_error` regression intact).

### 2. Auto-escalate to `coords-pro` on noop detection

In the multipass orchestrator (same file, post-poll branch that sets `sync_noop_suspect`), when:
- `sync_noop_suspect === true`, AND
- `retry_variant !== "coords-pro"`, AND
- `_v1291.in_bounds === true`

immediately re-queue the turn with `retry_variant: "coords-pro"` and replace the pass's `output_url` only after the retry resolves to a non-noop output (check `sync_output_probe.syncOutputUnchanged === false` AND the new clip is not flagged noop). If the retry also noops twice, fall back to the original muxed preclip (silent video) so we don't ship a re-encoded "fake lipsync" clip — and log `lipsync_final_fallback: "silent_preclip"` on the pass.

### 3. Pad ultra-short voiced audio before dispatch

For preclips where `audio_voiced_sec < 0.8s` (Matthew turn falls here): add 200ms of digital silence head + 200ms tail to the tight WAV before sending to Sync.so. Sync-3 needs ~1s of motion context to commit to lip movement; this stops the no-op on tiny utterances without changing the muxed timeline (the silence is trimmed off when the lipsync output is sliced back into the stitched timeline using `audio_tight.windows_secs`, which already drives the cut).

Implementation: extend the existing `audio_normalization` block (already passes through ffmpeg) to apply `apad`/`adelay` when `audio_voiced_sec < 0.8`. Mode becomes `"padded_short_voiced_v12925"`.

### 4. Recover the failing scene + verify

- Reset `dialog_shots.passes[1]` and `passes[3]` of scene `0145fdc4…b276` to `status: "queued"` with `retry_variant: "coords-pro"` and clear `final_url`, so the existing poller picks them up under the new logic.
- After re-dispatch, confirm in `syncso_dispatch_log` that the new attempts for turns 2 and 4 carry `coords != null` and `frame_number != null`, the webhook reports `COMPLETED` (not COMPLETED_NOOP_SUSPECT), and `sync_output_probe.syncOutputUnchanged === false`.
- Visually confirm in the re-rendered stitched MP4 that Matthew and Sarah now have proper lip movement matching their VO segments.

## Files touched

- `supabase/functions/compose-dialog-segments/index.ts` — retry-variant precedence, noop-escalation branch, short-voiced padding.
- (No frontend changes; no DB schema changes; no other edge functions.)

## What this does NOT change

- The v129.24 fix for clean single-face preclips (auto_detect on first attempt) stays.
- Multi-speaker ambiguous preclips still hit the existing coordinate path with the existing guards.
- No model swap (we keep `sync-3`) — switching to `lipsync-2-pro` would double the spend per turn and isn't needed once the coords retry actually executes.
