
UPDATE public.composer_scenes
SET lip_sync_status = NULL,
    twoshot_stage = NULL,
    clip_error = NULL,
    dialog_shots = NULL,
    lip_sync_applied_at = NULL,
    updated_at = now()
WHERE id = '9771d05b-cae9-4d66-bb3c-9c6912a67e88';

DELETE FROM public.syncso_inflight_jobs
WHERE scene_id = '9771d05b-cae9-4d66-bb3c-9c6912a67e88';

DELETE FROM public.dialog_dispatch_locks
WHERE scene_id = '9771d05b-cae9-4d66-bb3c-9c6912a67e88';
