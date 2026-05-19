UPDATE public.composer_scenes
SET
  reference_image_url = NULL,
  clip_url = NULL,
  clip_status = 'pending',
  clip_error = NULL,
  lip_sync_status = NULL,
  lip_sync_applied_at = NULL,
  lip_sync_source_clip_url = NULL,
  twoshot_stage = NULL,
  replicate_prediction_id = NULL,
  audio_plan = COALESCE(audio_plan, '{}'::jsonb) - 'twoshot',
  updated_at = now()
WHERE id IN (
  '40367ba2-929b-4cdc-85ef-5a630911d78f'::uuid,
  '2f0f6807-00b6-4251-b193-99fc7dd3c61a'::uuid
);

DELETE FROM public.scene_anchor_cache
WHERE scene_id IN (
  '40367ba2-929b-4cdc-85ef-5a630911d78f'::uuid,
  '2f0f6807-00b6-4251-b193-99fc7dd3c61a'::uuid
);