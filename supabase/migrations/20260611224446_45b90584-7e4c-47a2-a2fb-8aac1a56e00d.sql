
WITH targets AS (
  SELECT id FROM public.composer_scenes
  WHERE id IN (
    'c7d4bb76-b20d-4591-bc13-6763fbdf52bd'::uuid,
    'f2a58546-692a-4ef5-a690-ba93b513abf5'::uuid
  )
)
UPDATE public.composer_scenes cs
SET
  reference_image_url = NULL,
  clip_url = NULL,
  clip_status = 'pending',
  clip_error = NULL,
  lip_sync_status = 'pending',
  twoshot_stage = NULL,
  lip_sync_applied_at = NULL,
  lip_sync_source_clip_url = NULL,
  dialog_shots = NULL,
  replicate_prediction_id = NULL,
  audio_plan = COALESCE(audio_plan, '{}'::jsonb)
    #- '{twoshot,anchor_face_audit}'
    #- '{twoshot,faceMap}'
    #- '{twoshot,heartbeat}'
    #- '{twoshot,syncJobs}'
    #- '{twoshot,sync_job_id}'
    #- '{twoshot,segments_payload}'
    #- '{twoshot,last_segments}',
  updated_at = now()
WHERE cs.id IN (SELECT id FROM targets);

DELETE FROM public.scene_anchor_cache
WHERE scene_id IN (
  'c7d4bb76-b20d-4591-bc13-6763fbdf52bd'::uuid,
  'f2a58546-692a-4ef5-a690-ba93b513abf5'::uuid
);
