UPDATE public.composer_scenes
SET dialog_shots = NULL,
    lip_sync_status = 'pending',
    twoshot_stage = 'master_clip',
    lip_sync_applied_at = NULL,
    clip_error = NULL,
    updated_at = now()
WHERE id IN ('7842c6f6-c3be-4a3a-9253-0d064476de3b','a500df2e-f2c0-4619-9807-d7d68449a237');