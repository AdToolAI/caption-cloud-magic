
-- =========================================================
-- Global per-user limits: max 500 videos and max 10 GB across
-- video_creations, content_items (videos) and media_assets.
-- =========================================================

CREATE OR REPLACE FUNCTION public.enforce_user_video_library_limits(
  _user_id uuid,
  _max_videos int DEFAULT 500,
  _max_storage_mb numeric DEFAULT 10240
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  total_count int := 0;
  total_mb numeric := 0;
  v_workspace_ids uuid[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(workspace_id) INTO v_workspace_ids
  FROM public.workspace_members
  WHERE user_id = _user_id;

  -- Build a unified, ordered (newest first) view of all video items
  -- We'll iterate, keep newest within both caps, and delete the rest.
  CREATE TEMP TABLE IF NOT EXISTS _media_to_keep (
    src text, id uuid, created_at timestamptz, size_mb numeric
  ) ON COMMIT DROP;
  DELETE FROM _media_to_keep;

  CREATE TEMP TABLE IF NOT EXISTS _media_all (
    src text, id uuid, created_at timestamptz, size_mb numeric
  ) ON COMMIT DROP;
  DELETE FROM _media_all;

  -- video_creations (completed only)
  INSERT INTO _media_all
  SELECT 'video_creations', id, created_at, 20::numeric
  FROM public.video_creations
  WHERE user_id = _user_id AND status = 'completed';

  -- content_items (videos in user's workspaces)
  IF v_workspace_ids IS NOT NULL THEN
    INSERT INTO _media_all
    SELECT 'content_items', id, created_at,
           COALESCE(file_size_mb, 20)::numeric
    FROM public.content_items
    WHERE workspace_id = ANY(v_workspace_ids)
      AND type = 'video';
  END IF;

  -- media_assets (uploads, both video & image — for storage cap)
  INSERT INTO _media_all
  SELECT 'media_assets', id, created_at,
         COALESCE(size_bytes, 0)::numeric / (1024.0 * 1024.0)
  FROM public.media_assets
  WHERE user_id = _user_id;

  -- Walk newest -> oldest, keep until either cap reached
  FOR r IN SELECT * FROM _media_all ORDER BY created_at DESC, id DESC
  LOOP
    -- Videos count toward video cap; media_assets images don't
    IF r.src IN ('video_creations', 'content_items') THEN
      IF total_count >= _max_videos THEN
        CONTINUE;
      END IF;
    END IF;

    IF total_mb + r.size_mb > _max_storage_mb THEN
      CONTINUE;
    END IF;

    INSERT INTO _media_to_keep VALUES (r.src, r.id, r.created_at, r.size_mb);

    IF r.src IN ('video_creations', 'content_items') THEN
      total_count := total_count + 1;
    END IF;
    total_mb := total_mb + r.size_mb;
  END LOOP;

  -- Delete everything not in keep set
  DELETE FROM public.video_creations vc
  WHERE vc.user_id = _user_id
    AND vc.status = 'completed'
    AND vc.id NOT IN (SELECT id FROM _media_to_keep WHERE src = 'video_creations');

  IF v_workspace_ids IS NOT NULL THEN
    DELETE FROM public.content_items ci
    WHERE ci.workspace_id = ANY(v_workspace_ids)
      AND ci.type = 'video'
      AND ci.id NOT IN (SELECT id FROM _media_to_keep WHERE src = 'content_items');
  END IF;

  DELETE FROM public.media_assets ma
  WHERE ma.user_id = _user_id
    AND ma.id NOT IN (SELECT id FROM _media_to_keep WHERE src = 'media_assets');
END;
$$;

-- Trigger function: on any insert/update, run enforcement for affected user
CREATE OR REPLACE FUNCTION public.trg_enforce_user_video_library_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'video_creations' THEN
    IF NEW.status IS DISTINCT FROM 'completed' THEN
      RETURN NEW;
    END IF;
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'content_items' THEN
    IF NEW.type IS DISTINCT FROM 'video' THEN
      RETURN NEW;
    END IF;
    -- find a user from the workspace (any member)
    SELECT user_id INTO v_user_id
    FROM public.workspace_members
    WHERE workspace_id = NEW.workspace_id
    LIMIT 1;
  ELSIF TG_TABLE_NAME = 'media_assets' THEN
    v_user_id := NEW.user_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    PERFORM public.enforce_user_video_library_limits(v_user_id, 500, 10240);
  END IF;
  RETURN NEW;
END;
$$;

-- Replace the previous narrower trigger
DROP TRIGGER IF EXISTS enforce_video_creations_limit_aiu ON public.video_creations;
DROP TRIGGER IF EXISTS enforce_user_video_limits_vc ON public.video_creations;
CREATE TRIGGER enforce_user_video_limits_vc
AFTER INSERT OR UPDATE OF status ON public.video_creations
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_user_video_library_limits();

DROP TRIGGER IF EXISTS enforce_user_video_limits_ci ON public.content_items;
CREATE TRIGGER enforce_user_video_limits_ci
AFTER INSERT OR UPDATE OF type, file_size_mb ON public.content_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_user_video_library_limits();

DROP TRIGGER IF EXISTS enforce_user_video_limits_ma ON public.media_assets;
CREATE TRIGGER enforce_user_video_limits_ma
AFTER INSERT OR UPDATE OF size_bytes ON public.media_assets
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_user_video_library_limits();

-- One-shot backfill: bring every user under both caps now
DO $$
DECLARE
  uid uuid;
BEGIN
  FOR uid IN
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM public.video_creations WHERE user_id IS NOT NULL AND status = 'completed'
      UNION
      SELECT user_id FROM public.media_assets WHERE user_id IS NOT NULL
      UNION
      SELECT wm.user_id
      FROM public.content_items ci
      JOIN public.workspace_members wm ON wm.workspace_id = ci.workspace_id
      WHERE ci.type = 'video'
    ) u
  LOOP
    PERFORM public.enforce_user_video_library_limits(uid, 500, 10240);
  END LOOP;
END $$;
