UPDATE public.composer_scenes
SET lip_sync_status = NULL,
    twoshot_stage = NULL,
    clip_error = NULL,
    dialog_shots = NULL,
    replicate_prediction_id = NULL,
    updated_at = now()
WHERE id = 'c59e6d09-07a9-4764-ab2d-5a679790cbf8';