
-- 1. Refund 144 credits for the broken render to the scene's owner
DO $$
DECLARE
  v_user UUID;
BEGIN
  SELECT p.user_id INTO v_user
  FROM composer_scenes s
  JOIN composer_projects p ON p.id = s.project_id
  WHERE s.id = 'e3df41ad-aaa1-4659-85c2-0630e458dd52';

  IF v_user IS NOT NULL THEN
    UPDATE wallets
       SET balance = COALESCE(balance, 0) + 144,
           updated_at = now()
     WHERE user_id = v_user;
  END IF;
END $$;

-- 2. Reset scene state and invalidate cached faceMap so identity-match runs fresh
UPDATE composer_scenes
   SET clip_url = COALESCE(lip_sync_source_clip_url, clip_url),
       lip_sync_status = 'pending',
       twoshot_stage = NULL,
       replicate_prediction_id = NULL,
       lip_sync_applied_at = NULL,
       clip_error = NULL,
       audio_plan = jsonb_set(
         COALESCE(audio_plan, '{}'::jsonb),
         '{twoshot}',
         (COALESCE(audio_plan->'twoshot', '{}'::jsonb)
           - 'faceMap'
           - 'syncJobs'
           - 'heartbeat'),
         true
       ),
       updated_at = now()
 WHERE id = 'e3df41ad-aaa1-4659-85c2-0630e458dd52';
