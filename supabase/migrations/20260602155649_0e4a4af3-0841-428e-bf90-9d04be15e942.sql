UPDATE public.composer_scenes
SET lip_sync_status = NULL,
    dialog_shots = NULL,
    clip_error = NULL,
    twoshot_stage = NULL,
    updated_at = now()
WHERE id = 'afbfd804-0b01-4557-bba2-3ac4e2b7a1a0';