-- v107 cleanup: refund + reset wrong-lipsync scene 89db58ca and stuck scene c8fb1fe6

-- 1) Refund 324 credits for scene 89db58ca (user 8948d3d9-2c5e-4405-9e9c-1624448e7189)
--    Idempotent: only refund if dialog_shots.refunded is not true yet.
DO $$
DECLARE
  v_user uuid := '8948d3d9-2c5e-4405-9e9c-1624448e7189';
  v_scene uuid := '89db58ca-a4fb-4313-a0bc-448936b03315';
  v_cost int := 324;
  v_already boolean;
BEGIN
  SELECT COALESCE((dialog_shots->>'refunded')::boolean, false)
    INTO v_already
    FROM public.composer_scenes WHERE id = v_scene;
  IF NOT v_already THEN
    UPDATE public.wallets
       SET balance = COALESCE(balance, 0) + v_cost,
           updated_at = now()
     WHERE user_id = v_user;
  END IF;
END $$;

-- 2) Reset scene 89db58ca for fresh re-run under v107.
UPDATE public.composer_scenes
   SET clip_url = NULL,
       lip_sync_status = 'pending',
       twoshot_stage = 'master_clip',
       clip_status = 'ready',
       clip_error = NULL,
       dialog_shots = NULL,
       reference_image_url = NULL,
       audio_plan = COALESCE(audio_plan, '{}'::jsonb)
                    #- '{twoshot,syncJobs}'
                    #- '{twoshot,faceMap}'
                    #- '{twoshot,anchor_face_audit}'
                    #- '{twoshot,heartbeat}',
       updated_at = now()
 WHERE id = '89db58ca-a4fb-4313-a0bc-448936b03315';

DELETE FROM public.scene_anchor_cache WHERE scene_id = '89db58ca-a4fb-4313-a0bc-448936b03315';
DELETE FROM public.syncso_inflight_jobs WHERE scene_id = '89db58ca-a4fb-4313-a0bc-448936b03315';
DELETE FROM public.dialog_dispatch_locks WHERE scene_id = '89db58ca-a4fb-4313-a0bc-448936b03315';

-- 3) Reset stuck scene c8fb1fe6 for fresh re-run.
UPDATE public.composer_scenes
   SET clip_url = NULL,
       lip_sync_status = 'pending',
       twoshot_stage = 'master_clip',
       clip_status = 'ready',
       clip_error = NULL,
       dialog_shots = NULL,
       reference_image_url = NULL,
       audio_plan = COALESCE(audio_plan, '{}'::jsonb)
                    #- '{twoshot,syncJobs}'
                    #- '{twoshot,faceMap}'
                    #- '{twoshot,anchor_face_audit}'
                    #- '{twoshot,heartbeat}',
       updated_at = now()
 WHERE id = 'c8fb1fe6-7cd8-4934-868a-42ddb3b6950f';

DELETE FROM public.scene_anchor_cache WHERE scene_id = 'c8fb1fe6-7cd8-4934-868a-42ddb3b6950f';
DELETE FROM public.syncso_inflight_jobs WHERE scene_id = 'c8fb1fe6-7cd8-4934-868a-42ddb3b6950f';
DELETE FROM public.dialog_dispatch_locks WHERE scene_id = 'c8fb1fe6-7cd8-4934-868a-42ddb3b6950f';
