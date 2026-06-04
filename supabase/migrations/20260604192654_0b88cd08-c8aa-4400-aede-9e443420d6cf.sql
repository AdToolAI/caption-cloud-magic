UPDATE public.composer_scenes
SET dialog_shots = NULL,
    lip_sync_status = 'pending',
    twoshot_stage = NULL,
    clip_error = NULL,
    lip_sync_applied_at = NULL,
    replicate_prediction_id = NULL,
    updated_at = now()
WHERE id = '5f43e669-b154-4ac9-a516-b46acb7ee288';