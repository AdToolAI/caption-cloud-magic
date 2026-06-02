## What's actually happening

The screenshot's "Fehler — bitte Lip-Sync neu rendern" is a **false alarm**: the v4 per-turn pipeline is in fact running successfully right now.

DB state for scene `59dda889…`:

```
turn 0  status=ready    output=…dialog-turn-0.mp4   (completed 20:56:10)
turn 1  status=ready    output=…dialog-turn-1.mp4   (completed 20:55:09)
turn 2  status=lipsyncing  job=e2aed80c             (in flight)
lip_sync_status = running
```

So Sync.so per-turn (v4) is working. The reason the user sees "Fehler" is a **prior** v5 attempt that failed seconds before v4 was triggered:

```
20:53:44  compose-dialog-segments (v5) dispatches master+char0 with coords=[256,360]
20:54:05  Sync.so → FAILED "An unknown error occurred."  (3 speakers, master plate)
20:54:08  v5 marks scene failed, refunds 81 credits
20:54:20  useTwoShotAutoTrigger sees failed → resets and re-routes to compose-dialog-scene (v4)
20:54:35  v4 dispatches turn 1
20:55:14  v4 dispatches turn 0
20:55:21  v4 dispatches turn 2  (currently in flight)
```

That `pipelineStartRef` was already past 90% on the bar when v5 failed, so `usePipelineProgress`'s 4-minute stall detector flipped `hasFailure=true` even though v4 is now happily progressing underneath.

## Root cause

`supabase/functions/compose-clip-webhook/index.ts` (line ~291) **unconditionally invokes `compose-dialog-segments` (v5)** for every cinematic-sync scene after the master plate render finishes — including scenes with ≥3 speakers, where v5's multi-pass chain is known-broken (re-encodes its own output, Sync.so rejects with "unknown error").

Meanwhile the client-side `useTwoShotAutoTrigger` already routes correctly: 1–2 speakers → v5, ≥3 → v4. The server webhook ignores that rule and always picks v5 — so 3+ speaker scenes always burn one v5 attempt + refund + auto-retry loop before v4 can take over. This is the "Fehler banner that then magically recovers" pattern the user keeps hitting.

## Plan

### Stage 1 — Stop v5 from running on 3+ speaker scenes

`supabase/functions/compose-clip-webhook/index.ts`
- Just before the `compose-dialog-segments` invoke, compute `speakerCount` from `lipScene.audio_plan.speakers.length` (fallback `audio_plan.twoshot.speakers.length`, then unique `character_id` count, then 1).
- If `speakerCount >= 3` OR `lipScene.engine_override === 'cinematic-sync-legacy'`, invoke `compose-dialog-scene` (v4) instead. Otherwise keep `compose-dialog-segments` (v5) for 1–2 speakers.
- This mirrors the routing in `src/hooks/useTwoShotAutoTrigger.ts` (lines 542–557) so the server and client agree.
- Result: 3+ speaker scenes go straight to v4 per-turn, no failed v5 attempt, no refund-then-retry loop, no false "Fehler" banner.

### Stage 2 — Clear stale "Fehler" when the pipeline self-recovers

`src/hooks/usePipelineProgress.ts`
- When `lipsyncReal.failed` transitions from `true → false` (auto-retry path resets `lip_sync_status` from `failed` → `pending`), reset `realProgressRef.current = { value: 0, at: Date.now() }` and `runFloorRef.current = 0` for the lipsync slice.
- Concretely: add a `useEffect` watching `lipsyncReal.failed`. When it flips back to `false` while `isActive`, reset the stall baseline and the run floor so the 4-minute stall window starts fresh and `hasFailure` clears immediately.
- Also extend `isTerminalScene` / `failed` detection to ignore scenes whose `clip_error` starts with `auto-retry:` (these are recovering, not failed).

### Stage 3 — Make the existing Cancel button bullet-proof

`src/components/video-composer/SceneCard.tsx` + `supabase/functions/cancel-dialog-lipsync/index.ts`
- Confirm the "✕ Lip-Sync abbrechen" button (already added in v18) is visible whenever `lip_sync_status ∈ {pending, running, stitching, audio_muxing}` OR `twoshot_stage` is non-terminal. Tighten the visibility predicate so it also shows during the brief window where `lip_sync_status = 'failed'` but auto-retry hasn't fired yet.
- In `cancel-dialog-lipsync`, in addition to today's cleanup also DELETE the `syncso_inflight_jobs` rows for the scene and call Sync.so `DELETE /v2/generate/{jobId}` for every in-flight `sync_job_id` found in `dialog_shots.shots[*].sync_job_id` (today's code only walks `audio_plan.twoshot.syncJobs`, which v4 doesn't populate).
- After cancel, ensure `useTwoShotAutoTrigger` does NOT pick the scene back up (already gated on `lip_sync_status === 'canceled'` per v18).

### Stage 4 — Recovery for the current bad scene

For scene `59dda889-3548-4d7d-8087-850a92d433f1`: let v4 finish (turn 2 is in flight; webhook will arrive in <90s and the Lambda stitch will run). No DB intervention needed — the v4 path is working. The user just needs the UI to stop lying. Stage 2 fixes that.

If turn 2 also stalls, the user can press the (now-fixed) **✕ Lip-Sync abbrechen** button and start over, and Stage 1 ensures the next start goes straight to v4 without the wasted v5 attempt.

## Files to touch

```text
supabase/functions/compose-clip-webhook/index.ts        (Stage 1 — route ≥3 speakers to v4)
src/hooks/usePipelineProgress.ts                        (Stage 2 — clear stale Fehler)
src/components/video-composer/SceneCard.tsx             (Stage 3 — cancel visibility)
supabase/functions/cancel-dialog-lipsync/index.ts       (Stage 3 — kill v4 sync jobs)
mem/architecture/lipsync/sync-so-webhook-stage5         (doc v20)
```

## Out of scope
- No new providers, no Hailuo prompt changes.
- No change to the HeyGen, single-speaker, or 1–2 speaker (v5) paths.
- No migrations.

Please confirm and I'll execute Stages 1 → 4 in order.