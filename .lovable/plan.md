# Dialog-Lipsync v19 — Visible Lipsync + Stable Plate + Cancel

Two user-visible problems from the last successful render:

1. **Lips don't move** in the final clip — the stitched output is essentially the raw Hailuo plate or a pass-through; Sync.so output is not actually being used or the face wasn't detected.
2. **Hands/body move uncannily** — the Hailuo i2v plate is generated with too much motion freedom, producing the typical AI "noodle limbs" that no lipsync can rescue.

Plus the still-open UX gap: a stuck Lip-Sync run has no clean **Cancel/Reset** button, which leads to credit-burning re-loops.

---

## Diagnose first (before code changes)

For the most recent finished cinematic-sync scene the user is looking at:

- Pull `composer_scenes.audio_plan`, `dialog_shots`, `lip_sync_source_clip_url`, `clip_url`, `clip_source`, `duration_seconds`, `ai_prompt`.
- Pull the corresponding `syncso_inflight_jobs` rows + Sync.so job status (we already store `sync:<jobId>`) to confirm:
  - did Sync.so return `completed` with a real `output_url`, or
  - did it return `degraded`/`failed` and the pipeline silently fell back to the master plate?
- Pull `video_renders` rows for the preclips to confirm the Hailuo plate prompt that was actually sent.

This decides which of the three branches below is the real cause.

## Root-cause branches

### A. Lipsync output exists but is not what gets shown
Symptoms: `dialog_shots[*].output_url` set, `degraded=false`, but stitched `clip_url` ignores them.
- `stitch-dialog-shots` (or whichever function does the ffmpeg concat) must use `output_url` per turn, never falling back to the master plate when a turn is `ready`.
- WYSIWYG: the final `composer_scenes.clip_url` must point to the stitched lipsynced result, not to the original Hailuo master.

### B. Sync.so silently degraded → pass-through
Symptoms: turns marked `ready` with `degraded=true` or `output_url == sourceUrl`.
- For `degraded=true`, the per-turn segment must be marked **failed** (not ready) so the scene surfaces a clear error instead of stitching a pass-through.
- For 2+ speaker preclip path: if `auto_detect` finds 0 faces in the preclip frame, Sync.so returns the input unchanged. We must validate `output_url !== sourceUrl` before accepting and otherwise retry once with `coords` mode using the deterministic face center we computed in `compose-dialog-scene`.

### C. Hailuo plate has bad face / too much body motion
Symptoms: Sync.so detects no stable face because the avatar's head turns away, or hands wave through the face area.
- Constrain the **dialog-scene prompt** sent to Hailuo i2v:
  - Force `medium close-up, head and shoulders, eye-line to camera, subtle natural motion, no exaggerated hand gestures, hands out of frame or relaxed at sides`.
  - Add a negative-style suffix: `no waving hands, no overlapping arms, no head turn away from camera, no rapid body movement`.
- Lock framing per turn to the avatar's portrait crop so Sync.so always sees one clean face.
- This is the only branch that fixes the "weird hands/body". Lipsync cannot fix the underlying plate.

## Stage 1 — Plate stability (fix the uncanny motion)

`supabase/functions/compose-dialog-scene/index.ts`
- Add a `buildDialogPlatePrompt(turn)` helper that takes the per-speaker portrait + line and emits a constrained Hailuo i2v prompt (framing + motion guard + negative phrases above).
- Use this prompt for both the master plate and per-speaker preclips. No free-form `ai_prompt` for the dialog plate.
- Keep duration capped at the turn length + 0.4 s padding so Hailuo has less time to invent body motion.

## Stage 2 — Lipsync acceptance / fallback (fix the missing lip motion)

`supabase/functions/poll-dialog-shots/index.ts` + `supabase/functions/sync-so-webhook/index.ts`
- On Sync.so `completed`, reject the result if `output_url === sourceUrl` **or** `degraded === true`. Set the shot back to `pending` with `dispatch_mode='coords'` using the deterministic face center, increment `lipsync_retry_count` (cap 1 extra), then fail hard if it still degrades.
- Document the rule: **a degraded segment is never stitched**.

`supabase/functions/stitch-dialog-shots/index.ts` (whichever stitches the final clip)
- For every turn use `output_url`; if any turn is `failed`/`degraded`, surface `lip_sync_status='failed'` instead of silently producing a no-lipsync clip.
- After stitch, set `composer_scenes.clip_url = stitched_url` and `lip_sync_applied_at = now()`. The UI's playback element must read `clip_url`, not `lip_sync_source_clip_url`.

## Stage 3 — Cancel & clean reset (no more stuck loops)

New edge function `cancel-dialog-lipsync` (already partially scaffolded — verify and harden):
- Auth + ownership check via `composer_projects.user_id`.
- Idempotent: noop on `cancelled` / `done` / `null`.
- Single atomic UPDATE: `lip_sync_status='cancelled'`, `twoshot_stage=NULL`, `dialog_shots=NULL`, `replicate_prediction_id=NULL`, `clip_error='cancelled_by_user'`.
- Best-effort provider cancel: Sync.so `DELETE /v2/generate/{jobId}` for every `sync:<jobId>` in `audio_plan.twoshot.syncJobs`; Replicate cancel for any plain UUID.
- Delete all `syncso_inflight_jobs` rows for the scene.
- Idempotent credit refund (deterministic key `scene_id + ':cancel'`).

UI — `src/components/video-composer/SceneCard.tsx`
- Show **✕ Lip-Sync abbrechen** when `lipSyncStatus ∈ {pending, running, stitching, audio_muxing}`.
- Optimistic update to `cancelled` + `clearLipSyncPending(scene.id)` so realtime can't revert it.
- After cancel, re-enable **🔁 Lip-Sync neu rendern**.

Auto-trigger guards — `src/components/video-composer/ClipsTab.tsx` + `src/hooks/useTwoShotAutoTrigger.ts`
- Treat `lip_sync_status === 'cancelled'` as "do not auto-restart". Only the explicit "neu rendern" button may re-arm to `pending`.

## Stage 4 — Recovery for the current bad scene

One-shot migration / SQL via the cancel function on the affected scene id:
- Mark its current `lip_sync_status='cancelled'`, clear `dialog_shots`, then the user can press "Lip-Sync neu rendern" once and the new pipeline (Stage 1 + 2) takes over.

## Files to touch

```text
supabase/functions/compose-dialog-scene/index.ts         (Stage 1 — plate prompt)
supabase/functions/poll-dialog-shots/index.ts            (Stage 2 — reject pass-through)
supabase/functions/sync-so-webhook/index.ts              (Stage 2 — degrade = failed)
supabase/functions/stitch-dialog-shots/index.ts          (Stage 2 — use output_url, fail loud)
supabase/functions/cancel-dialog-lipsync/index.ts        (Stage 3 — verify/harden)
src/components/video-composer/SceneCard.tsx              (Stage 3 — Cancel button)
src/components/video-composer/ClipsTab.tsx               (Stage 3 — auto-trigger guard)
src/hooks/useTwoShotAutoTrigger.ts                       (Stage 3 — auto-trigger guard)
mem/architecture/lipsync/sync-so-webhook-stage5          (doc v19)
```

## Out of scope
- No new providers, no new models.
- No change to HeyGen path, single-speaker `compose-lipsync-scene`, or video composer engines other than `cinematic-sync`.

Please confirm and I'll execute Stages 1 → 4 in order, verifying the affected scene end-to-end before closing.
