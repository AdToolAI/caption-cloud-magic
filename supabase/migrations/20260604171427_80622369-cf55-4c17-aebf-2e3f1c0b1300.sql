UPDATE public.composer_scenes
SET
  dialog_shots = NULL,
  lip_sync_status = 'pending',
  lip_sync_applied_at = NULL,
  twoshot_stage = NULL,
  replicate_prediction_id = NULL,
  clip_error = NULL,
  updated_at = now()
WHERE id IN (
  '4e7a0601-8b6e-4088-846d-edc12c3f72e0',
  '64b2ae86-c70d-4097-ae4e-89570edad884'
);