UPDATE public.composer_scenes
SET audio_plan = jsonb_set(
      jsonb_set(
        audio_plan,
        '{twoshot,useExternalAudio}',
        'false'::jsonb,
        true
      ),
      '{twoshot,embeddedAudio}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
WHERE engine_override = 'cinematic-sync'
  AND audio_plan -> 'twoshot' -> 'speakers' IS NOT NULL
  AND jsonb_array_length(audio_plan -> 'twoshot' -> 'speakers') = 1
  AND (audio_plan -> 'twoshot' ->> 'useExternalAudio')::boolean IS DISTINCT FROM false;

UPDATE public.composer_scenes
SET clip_status = 'pending',
    clip_url = NULL,
    reference_image_url = NULL,
    replicate_prediction_id = NULL,
    twoshot_stage = NULL,
    lip_sync_status = NULL,
    lip_sync_applied_at = NULL,
    lip_sync_source_clip_url = NULL,
    dialog_shots = NULL,
    audio_plan = NULL,
    character_audio_url = NULL,
    clip_error = NULL,
    updated_at = now()
WHERE id = 'b9cb19f6-ea8b-41e9-b233-f6b1c9b94179';

DELETE FROM public.scene_audio_clips
WHERE scene_id = 'b9cb19f6-ea8b-41e9-b233-f6b1c9b94179'
  AND kind = 'voiceover';

DELETE FROM public.scene_anchor_cache
WHERE scene_id = 'b9cb19f6-ea8b-41e9-b233-f6b1c9b94179';
