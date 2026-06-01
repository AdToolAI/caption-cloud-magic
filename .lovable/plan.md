## Root cause

`supabase/functions/poll-dialog-shots/index.ts` **fails to boot since the last deploy** with:

```
Uncaught SyntaxError: Unexpected reserved word
  at .../poll-dialog-shots/index.ts:643:31
```

`deno check` reveals the real source location at **lines 852 + 854**:

```ts
polled.forEach((res, i) => {        // ← sync callback
  ...
  if (shot.sync_job_id) await releaseInflightSyncJob(supabase, shot.sync_job_id);
  ...
});
```

`await` was added inside a non-async `Array.prototype.forEach` callback → TS1308 → edge-runtime refuses to boot the module.

## Impact on the 3-character pipeline (observed in logs)

- `sync-so-webhook` works fine and pushed both 3-speaker scenes (`b4593473…`, `fda8ac16…`) through `pass 0 → 1 → 2 → audio_muxing/done`.
- But the **cron poll worker (`poll-dialog-shots`) is completely dead** since the last deploy. That means:
  - No per-shot 4-min Sync.so timeout watchdog → stuck jobs hang forever.
  - No re-dispatch of new turns when the webhook is missed/delayed.
  - No `stitching` recovery path.
  - Scenes that don't get a clean webhook (e.g. current `b4593473…` stuck at `lip_sync_status='audio_muxing'`) cannot self-heal.
- This is why the UI shows **"Lipsync 1/3 · Fehler · Bitte Lip-Sync neu rendern"** — the recovery cron that normally moves the badge forward never runs.

The 1-speaker and 2-speaker code paths are unaffected by the fix because the bug is purely a syntax-level boot failure — fixing it restores the same poll loop they were already relying on.

## Fix (one file, surgical)

`supabase/functions/poll-dialog-shots/index.ts`, lines ~833–861:

Replace the sync `forEach` over `Promise.allSettled` results with a plain indexed `for` loop inside the existing `async` function so the two `await releaseInflightSyncJob(...)` calls are syntactically valid:

```ts
const polled = await Promise.allSettled(
  inFlight.map((s) => pollSyncJob(syncKey, s.sync_job_id!)),
);
for (let i = 0; i < polled.length; i++) {
  const res = polled[i];
  const shot = inFlight[i];
  if (res.status !== "fulfilled") {
    console.warn(`[poll-dialog-shots] turn ${shot.idx} poll error`, (res.reason as Error)?.message);
    continue;
  }
  const p = res.value;
  if (p.status === "COMPLETED" && p.outputUrl) {
    shot.output_url = p.outputUrl;
    shot.status = "ready";
    shot.completed_at = new Date().toISOString();
    mutated = true;
    if (shot.sync_job_id) await releaseInflightSyncJob(supabase, shot.sync_job_id);
  } else if (["FAILED", "REJECTED", "CANCELED"].includes(p.status)) {
    if (shot.sync_job_id) await releaseInflightSyncJob(supabase, shot.sync_job_id);
    if (!prepareShotRetry(shot, `sync_${p.status}`, shots)) {
      degradeShotToMaster(shot, `sync_${p.status}: ${p.error ?? "unknown"}`, shots);
    }
    mutated = true;
  }
}
```

Behaviour is byte-identical to the existing logic — the only change is that `await` now sits inside an `async for` body instead of a sync `forEach`. **No change to dispatch logic, no change to single-speaker or two-shot paths, no DB migration, no schema change.**

## Verification

1. After deploy, `supabase--edge_function_logs poll-dialog-shots` no longer shows `worker boot error`; instead the normal `tick …` lines appear once per minute (pg_cron).
2. Reset stuck scene `b4593473-6be8-4faa-ba6d-d0737118ae53` by clicking "Lip-Sync neu rendern" in the UI → expect it to progress `audio_muxing → applied`.
3. 1-speaker and 2-speaker regression check: existing scenes with `lip_sync_status='applied'` remain untouched; a fresh single-speaker render still completes end-to-end via the same restored poll loop.

## Not in scope

- Sync.so's `coords-pro` "unknown error" (provider-side; already mitigated by the existing `auto-pro` fallback).
- The compose-video-clips async dispatch, sync-so-webhook per-pass retry budget, or any UI changes — those stay exactly as they are.
