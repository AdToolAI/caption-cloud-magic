DO $$
DECLARE
  v_scene_id uuid := '94c42a63-07be-41e9-b046-3dc4a10e4ffb';
  v_user_id  uuid;
  v_cost     int;
  v_refunded boolean;
BEGIN
  SELECT cp.user_id,
         COALESCE((cs.dialog_shots->>'cost_credits')::int, 0),
         COALESCE((cs.dialog_shots->>'refunded')::boolean, false)
    INTO v_user_id, v_cost, v_refunded
  FROM public.composer_scenes cs
  JOIN public.composer_projects cp ON cp.id = cs.project_id
  WHERE cs.id = v_scene_id;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'scene % not found — skipping', v_scene_id;
    RETURN;
  END IF;

  IF NOT v_refunded AND v_cost > 0 THEN
    UPDATE public.wallets
       SET balance = balance + v_cost,
           updated_at = now()
     WHERE user_id = v_user_id;
    RAISE NOTICE 'refunded % credits to user %', v_cost, v_user_id;
  END IF;

  UPDATE public.composer_scenes
     SET dialog_shots = jsonb_build_object(
           'reset_at', to_jsonb(now()),
           'reset_reason', 'v77_wrong_face_targets_plate_native_rerun',
           'refunded', true,
           'previous_cost_credits', v_cost
         ),
         lip_sync_status = NULL,
         twoshot_stage = NULL,
         lip_sync_applied_at = NULL,
         lip_sync_source_clip_url = NULL,
         replicate_prediction_id = NULL,
         clip_error = 'v77_reset: anchor-coord drift produced wrong face targets — re-run lip-sync (now plate-native)',
         updated_at = now()
   WHERE id = v_scene_id;

  DELETE FROM public.syncso_inflight_jobs WHERE scene_id = v_scene_id;
END $$;