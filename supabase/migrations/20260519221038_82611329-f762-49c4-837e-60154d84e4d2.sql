UPDATE public.composer_scenes
SET reference_image_url = NULL,
    clip_url = NULL,
    clip_status = 'pending',
    clip_error = NULL,
    lip_sync_status = NULL,
    lip_sync_applied_at = NULL,
    lip_sync_source_clip_url = NULL,
    twoshot_stage = NULL,
    replicate_prediction_id = NULL,
    updated_at = now()
WHERE id = 'ab0b0a8e-7d01-4fae-b4cb-35912f6af1e4';