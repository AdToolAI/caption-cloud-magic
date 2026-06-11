-- v109 reset: clear dialog/lipsync state for affected scenes so a fresh
-- dispatch picks up the new native-resolution preclip (no 220→512 upscale).
UPDATE public.composer_scenes
SET lip_sync_status = NULL,
    twoshot_stage   = NULL,
    clip_error      = NULL,
    dialog_shots    = NULL,
    lip_sync_applied_at = NULL,
    updated_at      = now()
WHERE id IN (
  '339ee120-5bb1-4103-84d9-1572167709c0',
  '9771d05b-cae9-4d66-bb3c-9c6912a67e88'
);

DELETE FROM public.syncso_inflight_jobs
WHERE scene_id IN (
  '339ee120-5bb1-4103-84d9-1572167709c0',
  '9771d05b-cae9-4d66-bb3c-9c6912a67e88'
);

DELETE FROM public.dialog_dispatch_locks
WHERE scene_id IN (
  '339ee120-5bb1-4103-84d9-1572167709c0',
  '9771d05b-cae9-4d66-bb3c-9c6912a67e88'
);