UPDATE composer_scenes
SET
  lip_sync_status = NULL,
  twoshot_stage = NULL,
  clip_error = NULL,
  dialog_shots = NULL,
  updated_at = now()
WHERE id = 'c5d4db3e-37a9-422a-9261-6ffbe5bc3241'
  AND clip_error LIKE 'plate_target_face_missing%';