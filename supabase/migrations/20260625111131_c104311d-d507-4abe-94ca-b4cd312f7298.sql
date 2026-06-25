update public.composer_scenes
set twoshot_stage = null,
    clip_error = null,
    lip_sync_status = 'pending',
    updated_at = now()
where id = '6b600abc-10af-442f-ac87-bfa8461983c6';