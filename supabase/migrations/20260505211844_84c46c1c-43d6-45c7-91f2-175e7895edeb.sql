-- Auto-enforce a per-user limit of 500 completed videos in the media library.
-- Whenever a video_creations row is inserted (or transitions to completed),
-- we delete the OLDEST excess rows for that user so the newest video survives.

CREATE OR REPLACE FUNCTION public.enforce_video_creations_limit_for_user(_user_id uuid, _max_videos int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int := 0;
BEGIN
  IF _user_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH del AS (
    DELETE FROM public.video_creations
    WHERE id IN (
      SELECT id
      FROM public.video_creations
      WHERE user_id = _user_id
        AND status = 'completed'
      ORDER BY created_at ASC, id ASC
      OFFSET _max_videos
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_enforce_video_creations_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act once a row is in 'completed' state (i.e. counts toward the library).
  IF NEW.status = 'completed' AND NEW.user_id IS NOT NULL THEN
    PERFORM public.enforce_video_creations_limit_for_user(NEW.user_id, 500);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_video_creations_limit_aiu ON public.video_creations;
CREATE TRIGGER enforce_video_creations_limit_aiu
AFTER INSERT OR UPDATE OF status ON public.video_creations
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_video_creations_limit();

-- One-shot backfill: bring every existing user under the 500-video cap.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT user_id
    FROM public.video_creations
    WHERE status = 'completed' AND user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) > 500
  LOOP
    PERFORM public.enforce_video_creations_limit_for_user(r.user_id, 500);
  END LOOP;
END $$;