UPDATE public.composer_scenes
SET lip_sync_status = 'pending',
    clip_error = NULL,
    dialog_shots = '{}'::jsonb,
    twoshot_stage = NULL,
    replicate_prediction_id = NULL,
    updated_at = now()
WHERE id = '4992cff4-e351-461c-aaae-a765696acf12';