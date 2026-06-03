UPDATE composer_scenes
SET clip_status = 'pending',
    clip_url = NULL,
    lip_sync_status = NULL,
    twoshot_stage = NULL,
    dialog_shots = NULL,
    clip_error = NULL,
    lip_sync_source_clip_url = NULL,
    lip_sync_applied_at = NULL,
    updated_at = now()
WHERE id = '1b877978-29da-4a20-9fb4-813042a60f9c';