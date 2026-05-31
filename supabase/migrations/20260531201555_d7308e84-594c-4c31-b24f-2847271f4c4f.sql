
UPDATE public.composer_scenes
SET clip_status = 'pending',
    clip_url = NULL,
    clip_error = NULL,
    reference_image_url = NULL,
    replicate_prediction_id = NULL,
    twoshot_stage = NULL,
    lip_sync_status = NULL,
    lip_sync_source_clip_url = NULL,
    lip_sync_applied_at = NULL,
    audio_plan = COALESCE(audio_plan, '{}'::jsonb) - 'twoshot',
    updated_at = now()
WHERE id IN (
  'b48e1edf-2c57-488e-95e4-4e49f1e8320e',
  'c95a44c4-6e85-403b-9d47-ebd25391e936'
);

DELETE FROM public.scene_anchor_cache
WHERE scene_id IN (
  'b48e1edf-2c57-488e-95e4-4e49f1e8320e',
  'c95a44c4-6e85-403b-9d47-ebd25391e936'
);
