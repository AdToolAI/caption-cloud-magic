## Problem

In 3-speaker (and 2-speaker) cinematic-sync scenes, only the first speaker's lips move. Speakers 2 and 3 stay frozen even though all Sync.so passes report `status: done`.

## Root Cause

`compose-dialog-segments/index.ts` (lines 851–870) has a "scene-wide variant learning" rule (Stage H): if pass 0 fell back from `coords-pro` to `auto-pro` (because Sync.so threw the opaque `provider_unknown_error` once), then every subsequent fresh pass starts at `auto-pro` instead of `coords-pro`.

DB confirms exactly this on both recent 3-speaker scenes (`b4593473…`, `fda8ac16…`):

| Pass | Speaker | coords            | retry_count | retry_variant |
|------|---------|-------------------|-------------|---------------|
| 0    | char 0  | [414,170]         | 1           | `auto-pro`    |
| 1    | char 1  | [695,168]         | 0           | `auto-pro`    |
| 2    | char 2  | [971,187]         | 0           | `auto-pro`    |

In `auto-pro` mode the payload sets `active_speaker_detection.auto_detect: true` and the explicit per-speaker `coordinates` are dropped. The chained input video for pass 1 already has speaker 0's mouth animated; Sync.so's auto-detector latches onto the most active face (= speaker 0 again) or finds no audio↔face correlation, so speakers 1 and 2 receive no lip animation at all. Result matches exactly what the user sees.

The learning rule was originally meant to avoid repeating coords-pro failures on retries, but it should never have applied across speakers — each pass targets a **different face** with **its own validated coordinates**.

## Fix (single edge function, ~10 lines)

`supabase/functions/compose-dialog-segments/index.ts` — remove the `learnedVariant` propagation for fresh advance passes. Each pass starts at `coords-pro` and only falls back per-pass through the existing ladder (`coords-pro → auto-pro → auto-standard`), which `sync-so-webhook` already manages per-pass.

Before (lines 856–870):
```ts
const learnedVariant: RetryVariant | undefined = (() => {
  if (currentPassIdx === 0) return undefined;
  for (let i = currentPassIdx - 1; i >= 0; i--) {
    const v = passes[i]?.retry_variant as RetryVariant | undefined;
    if (v && v !== "coords-pro" && passes[i]?.status === "done") return v;
  }
  return undefined;
})();
const retryVariant: RetryVariant = isRetry
  ? (requestedRetryVariant ?? prevState?.retry_variant ?? "coords-pro")
  : (learnedVariant ?? "coords-pro");
```

After:
```ts
// Each pass targets a DIFFERENT face with its own validated coords. Never
// inherit a fallback variant from a sibling pass — that would drop the
// coords for speakers 2+ and let Sync.so re-detect speaker 0. The per-pass
// fallback ladder (coords-pro → auto-pro → auto-standard) is still applied
// inside sync-so-webhook on actual provider failures.
const retryVariant: RetryVariant = isRetry
  ? (requestedRetryVariant ?? prevState?.passes?.[currentPassIdx]?.retry_variant ?? "coords-pro")
  : "coords-pro";
```

Note: the `isRetry` path also switches from the top-level `prevState.retry_variant` (which is the *aggregate*) to the per-pass `retry_variant`, matching the per-pass retry budget introduced earlier.

## Why this is safe for 1- and 2-speaker scenes

- 1-speaker: only one pass, `currentPassIdx === 0`, behavior unchanged (always started at `coords-pro` already).
- 2-speaker: pass 1 now also starts at `coords-pro` with its own coords. If Sync.so throws `provider_unknown_error` on that specific pass, the existing per-pass retry ladder in `sync-so-webhook` (`MAX_V5_RETRIES = 2`, `coords-pro → auto-pro → auto-standard`) kicks in for that single pass only.
- 3-speaker: each pass targets its own face with explicit coords — fixes the reported bug.

## Recovery for the two stuck scenes

Both finished `lip_sync_status='done'` with the wrong video. After the deploy, the user clicks "Lip-Sync neu rendern" on each affected scene; it re-runs pass 0 fresh (coords-pro) and the webhook chains 1→2 with coords intact.

## Out of scope

- `sync-so-webhook` per-pass retry budget (already correct).
- `compose-video-clips` async dispatch.
- `poll-dialog-shots` boot fix (already deployed).
- `render-sync-segments-audio-mux` (audio mux — orthogonal to the video lipsync issue).
- N-slot face map / coords computation (already returns correct per-speaker coords, confirmed by DB values).

## Files changed

- `supabase/functions/compose-dialog-segments/index.ts` (~10 lines)
- `mem/features/video-composer/sync-segments-dialog-pipeline` — append note that cross-pass variant learning is forbidden (each pass targets a different face).
