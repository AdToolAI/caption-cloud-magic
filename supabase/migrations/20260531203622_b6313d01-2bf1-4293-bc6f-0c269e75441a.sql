UPDATE public.composer_scenes
SET clip_status = 'pending',
    clip_error = NULL,
    clip_source = 'ai-hailuo',
    clip_url = NULL,
    reference_image_url = NULL,
    replicate_prediction_id = NULL,
    twoshot_stage = NULL,
    lip_sync_status = NULL,
    lip_sync_source_clip_url = NULL,
    lip_sync_applied_at = NULL,
    dialog_shots = NULL,
    audio_plan = NULL,
    updated_at = now()
WHERE id = 'b9cb19f6-ea8b-41e9-b233-f6b1c9b94179';

DELETE FROM public.scene_anchor_cache WHERE scene_id = 'b9cb19f6-ea8b-41e9-b233-f6b1c9b94179';