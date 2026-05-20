DELETE FROM public.scene_anchor_cache WHERE scene_id = '4e771db5-cc40-40ec-b889-58057a3c9855';

UPDATE public.composer_scenes
SET
  reference_image_url = NULL,
  lock_reference_url = NULL,
  clip_url = NULL,
  lip_sync_source_clip_url = NULL,
  clip_status = 'pending',
  clip_error = NULL,
  lip_sync_status = NULL,
  twoshot_stage = NULL,
  audio_plan = COALESCE(audio_plan, '{}'::jsonb) - 'twoshot',
  updated_at = now()
WHERE id = '4e771db5-cc40-40ec-b889-58057a3c9855';