DELETE FROM public.scene_audio_clips
WHERE scene_id = 'b4237058-710d-4a9b-b011-a0ae01f19ebc'
  AND kind = 'voiceover';

UPDATE public.composer_scenes
SET character_audio_url = NULL,
    audio_plan = NULL,
    lip_sync_status = NULL,
    twoshot_stage = NULL,
    lip_sync_applied_at = NULL,
    updated_at = now()
WHERE id = 'b4237058-710d-4a9b-b011-a0ae01f19ebc';