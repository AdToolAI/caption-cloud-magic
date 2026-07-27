UPDATE public.composer_scenes
SET clip_status = 'pending',
    clip_error = NULL,
    twoshot_stage = NULL,
    updated_at = now()
WHERE id = '3e0cc017-08d2-4095-8cb8-9c704ef41984'
  AND clip_status = 'failed'
  AND clip_url IS NULL;