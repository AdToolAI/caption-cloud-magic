UPDATE public.composer_scenes
SET dialog_shots = NULL,
    lip_sync_status = NULL,
    twoshot_stage = NULL,
    clip_error = NULL,
    lip_sync_applied_at = NULL,
    updated_at = now()
WHERE id = '0b0b7f78-1b52-4210-9640-03124cf91fec';