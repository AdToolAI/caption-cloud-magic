DELETE FROM public.scene_anchor_cache
WHERE scene_id IN (
  'cf762abe-a4e7-4231-84b2-08d9f72f4c81',
  '40367ba2-929b-4cdc-85ef-5a630911d78f',
  '2f0f6807-00b6-4251-b193-99fc7dd3c61a',
  '16cde061-e716-4877-ad74-9a78acd63790',
  '9c546015-21f1-4715-b484-ffe53f23c36f',
  'ab0b0a8e-7d01-4fae-b4cb-35912f6af1e4',
  '733d206a-595a-47cc-8846-48a0ff85f989',
  '822ae0ce-0e9b-4ee2-9da1-3b7958650e19'
);

UPDATE public.composer_scenes
SET reference_image_url = NULL,
    lock_reference_url  = NULL,
    clip_url            = NULL,
    clip_status         = 'pending',
    clip_error          = NULL,
    lip_sync_status     = NULL,
    lip_sync_applied_at = NULL,
    lip_sync_source_clip_url = NULL,
    twoshot_stage       = NULL,
    replicate_prediction_id = NULL,
    audio_plan          = COALESCE(audio_plan, '{}'::jsonb) - 'twoshot',
    updated_at          = now()
WHERE id IN (
  'cf762abe-a4e7-4231-84b2-08d9f72f4c81',
  '40367ba2-929b-4cdc-85ef-5a630911d78f',
  '2f0f6807-00b6-4251-b193-99fc7dd3c61a',
  '16cde061-e716-4877-ad74-9a78acd63790',
  '9c546015-21f1-4715-b484-ffe53f23c36f',
  'ab0b0a8e-7d01-4fae-b4cb-35912f6af1e4',
  '733d206a-595a-47cc-8846-48a0ff85f989',
  '822ae0ce-0e9b-4ee2-9da1-3b7958650e19'
);