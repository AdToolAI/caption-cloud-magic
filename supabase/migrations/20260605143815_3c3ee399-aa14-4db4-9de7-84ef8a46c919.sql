DO $$
DECLARE
  v_user uuid;
  v_refunded boolean;
BEGIN
  SELECT p.user_id, COALESCE((s.dialog_shots->>'refunded')::boolean, false)
    INTO v_user, v_refunded
    FROM public.composer_scenes s
    JOIN public.composer_projects p ON p.id = s.project_id
   WHERE s.id = '9e5db560-ba42-42a6-abb2-554ddb062016';

  IF v_user IS NOT NULL AND NOT v_refunded THEN
    UPDATE public.wallets SET balance = balance + 81, updated_at = now() WHERE user_id = v_user;
  END IF;

  UPDATE public.composer_scenes
     SET clip_status = 'pending', clip_url = NULL, clip_error = NULL,
         lip_sync_status = NULL, twoshot_stage = NULL,
         replicate_prediction_id = NULL, dialog_shots = '[]'::jsonb,
         updated_at = now()
   WHERE id = '9e5db560-ba42-42a6-abb2-554ddb062016';
END $$;