UPDATE public.composer_scenes
SET lip_sync_status = 'pending',
    twoshot_stage = 'master_clip',
    replicate_prediction_id = NULL,
    clip_error = NULL,
    clip_status = 'pending',
    clip_url = NULL,
    audio_plan = COALESCE(audio_plan, '{}'::jsonb) #- '{twoshot,syncJobs}'
WHERE id = '70a34582-178c-4ed9-a357-5f4725e7902a';