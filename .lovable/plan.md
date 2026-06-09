## Root cause

The red toast `Lip-Sync fehlgeschlagen — scene_not_found` is **not** a real lip-sync failure. It originates from the auto-trigger fan-out after a Hailuo plate becomes ready:

- `ClipsTab.tsx` (≈L463–492) fires `compose-dialog-segments` for every scene that just finished, using `sceneId`s captured in a closure.
- `useTwoShotAutoTrigger.ts` (≈L411–452) does the same on its 8 s poll tick for every candidate scene it sees in client state.

If the user clicks **„Neues Projekt"** (composer-cancel-project), deletes a scene, or the scene id was replaced after `ensureProject()` re-persisted, the next invocation hits `compose-dialog-segments` for an id that no longer exists in `composer_scenes`. The edge function correctly returns `404 { error: "scene_not_found" }`, but the client classifies any non-2xx as an error and shows a destructive toast even though nothing actually went wrong — the scene is simply gone.

Verified:
- Edge logs for `compose-dialog-segments` show no real 404 for the affected project (only a `BUSY` lock-skip on the live scene `354cc157…`).
- The live scene is `lip_sync_status='pending'` and the right-hand panel shows "Lip-Sync läuft…" — the pipeline itself is healthy.
- The toast text matches the `scene_not_found` reason exactly, which is only thrown from `compose-dialog-segments` and `reset-lipsync-scene` / `cancel-dialog-lipsync` (the latter two are user-initiated, not auto-fired).

## Fix

Treat `scene_not_found` as a benign race (same class as `missing_audio_plan`, `missing_source_clip`, `master_clip_not_ready` already handled silently) and stop the auto-trigger from invoking the edge function at all when the scene is no longer in local state.

### 1. `src/hooks/useTwoShotAutoTrigger.ts`
- Add `'scene_not_found'` to the `SILENT_RACE` set (≈L422). Logs a warn, no toast.
- Before the `supabase.functions.invoke('compose-dialog-segments', …)` call (≈L411), early-return for any candidate whose id is no longer present in the latest `scenes` snapshot (defensive guard against stale closures after project reset / scene delete).
- Also clear the `inflight.current` entry immediately on a silent-race result so the next tick can retry cleanly without waiting 30 s.

### 2. `src/components/video-composer/ClipsTab.tsx`
- In the post-render auto-trigger fan-out (≈L463–492), add the same `scene_not_found` → silent classification next to the existing `tts_failed` / `no_voiceover` branches.
- Skip the invoke entirely when `sceneId` is not in the current `scenes` array (project was reset between the poll fetch and the auto-trigger).

### 3. `src/components/video-composer/VideoComposerDashboard.tsx` (New-Project cancel path)
- After `composer-cancel-project` succeeds, also clear any in-memory lip-sync auto-trigger queues / inflight maps tied to the old project id, so no stale fan-out fires against the old scene ids. Implementation: bump a `projectEpoch` counter passed to `useTwoShotAutoTrigger`; the hook ignores any pending `.then()` callback whose epoch ≠ current.

### 4. Server (defensive, optional but recommended)
- `supabase/functions/compose-dialog-segments/index.ts` L429–431: keep the 404 for direct API callers, but additionally return a stable shape `{ ok: true, status: 'scene_gone', scene_id }` with HTTP **200** when the request comes from the auto-trigger (detected by an optional `body.auto === true` flag the client adds). This eliminates the false error classification at the transport layer.

## Out of scope

- v86/v87 speaker-dedup + heuristic-block logic — unchanged.
- Real lip-sync failure handling (`tts_failed`, `no_voiceover`, true Sync.so errors) — unchanged, still toasts.
- `reset-lipsync-scene` / `cancel-dialog-lipsync` user-initiated 404s — leave loud, those are real misuse.

## Verification

1. Start a lip-sync run, then immediately click **„Neues Projekt"**. No red `scene_not_found` toast appears; console shows `[useTwoShotAutoTrigger] silent retry: scene_not_found` or `skipping invoke for missing scene`.
2. Delete a single scene mid-pipeline → same: no toast, no destructive UI.
3. Real failure path: kill Sync.so api key → still shows `Lip-Sync fehlgeschlagen` with a real reason.
4. Edge logs show the `compose-dialog-segments` call either short-circuits client-side or returns `200 scene_gone` instead of `404`.
