UPDATE public.composer_scenes
SET lip_sync_status = 'applied',
    twoshot_stage = 'applied',
    clip_error = NULL,
    updated_at = now()
WHERE id = 'ddde37a6-9334-4286-8aa4-528d8a8f4a5e'
  AND lip_sync_applied_at IS NOT NULL
  AND clip_url IS NOT NULL;

UPDATE public.composer_scenes
SET lip_sync_status = NULL,
    twoshot_stage = NULL,
    clip_error = NULL,
    dialog_shots = NULL,
    updated_at = now()
WHERE id = 'c8fb1fe6-7cd8-4934-868a-42ddb3b6950f';

DELETE FROM public.syncso_inflight_jobs
WHERE scene_id IN (
  'c8fb1fe6-7cd8-4934-868a-42ddb3b6950f',
  'ddde37a6-9334-4286-8aa4-528d8a8f4a5e'
);

DELETE FROM public.dialog_dispatch_locks
WHERE scene_id IN (
  'c8fb1fe6-7cd8-4934-868a-42ddb3b6950f',
  'ddde37a6-9334-4286-8aa4-528d8a8f4a5e'
);