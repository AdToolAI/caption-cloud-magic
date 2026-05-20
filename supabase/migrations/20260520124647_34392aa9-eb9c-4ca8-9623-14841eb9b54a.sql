
UPDATE public.composer_scenes
SET
  reference_image_url = NULL,
  clip_url = NULL,
  clip_error = NULL,
  clip_status = 'pending',
  preview_clip_url = NULL,
  lip_sync_source_clip_url = NULL,
  lip_sync_status = NULL,
  lip_sync_applied_at = NULL,
  audio_plan = COALESCE(audio_plan, '{}'::jsonb) - 'twoshot',
  updated_at = now()
WHERE id = '6d89affc-f926-466b-b0f8-12b11f3863b5';

DELETE FROM public.scene_anchor_cache
WHERE scene_id = '6d89affc-f926-466b-b0f8-12b11f3863b5';
