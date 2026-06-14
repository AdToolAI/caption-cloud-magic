UPDATE composer_scenes
SET dialog_shots = NULL,
    clip_url = NULL,
    clip_status = 'pending',
    lip_sync_status = NULL,
    twoshot_stage = NULL,
    lip_sync_applied_at = NULL,
    replicate_prediction_id = NULL,
    reference_image_url = NULL,
    updated_at = now()
WHERE id = 'e57ef6dd-31a4-4b9d-9b49-5894d64bea7d';

DELETE FROM scene_anchor_cache
WHERE scene_id = 'e57ef6dd-31a4-4b9d-9b49-5894d64bea7d';