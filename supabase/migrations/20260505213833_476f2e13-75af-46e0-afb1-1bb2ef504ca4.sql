
CREATE OR REPLACE FUNCTION public.enforce_user_video_library_limits(
  _user_id uuid,
  _max_videos integer DEFAULT 500,
  _max_storage_mb numeric DEFAULT 10240
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_ids uuid[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(workspace_id) INTO v_workspace_ids
  FROM public.workspace_members
  WHERE user_id = _user_id;

  -- Unified view of everything that counts
  CREATE TEMP TABLE IF NOT EXISTS _media_all (
    src text, id uuid, created_at timestamptz, size_mb numeric
  ) ON COMMIT DROP;
  DELETE FROM _media_all;

  INSERT INTO _media_all
  SELECT 'video_creations', id, created_at, 20::numeric
  FROM public.video_creations
  WHERE user_id = _user_id AND status = 'completed';

  IF v_workspace_ids IS NOT NULL THEN
    INSERT INTO _media_all
    SELECT 'content_items', id, created_at, COALESCE(file_size_mb, 20)::numeric
    FROM public.content_items
    WHERE workspace_id = ANY(v_workspace_ids) AND type = 'video';
  END IF;

  INSERT INTO _media_all
  SELECT 'media_assets', id, created_at,
         COALESCE(size_bytes, 0)::numeric / (1024.0 * 1024.0)
  FROM public.media_assets
  WHERE user_id = _user_id;

  -- Compute keep-set with set-based SQL: rank newest-first, keep top N
  -- and keep storage running-sum <= cap. Always keep the newest item
  -- so a single fresh upload never deletes itself.
  CREATE TEMP TABLE IF NOT EXISTS _media_to_keep (
    src text, id uuid
  ) ON COMMIT DROP;
  DELETE FROM _media_to_keep;

  INSERT INTO _media_to_keep (src, id)
  SELECT src, id
  FROM (
    SELECT
      src,
      id,
      created_at,
      size_mb,
      -- video count rank only across video sources
      CASE
        WHEN src IN ('video_creations', 'content_items')
          THEN ROW_NUMBER() OVER (
            PARTITION BY (src IN ('video_creations','content_items'))
            ORDER BY created_at DESC, id DESC
          )
        ELSE NULL
      END AS video_rank,
      -- storage running sum across ALL items, newest-first
      SUM(size_mb) OVER (
        ORDER BY created_at DESC, id DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS storage_running_mb,
      ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) AS overall_rank
    FROM _media_all
  ) ranked
  WHERE
    -- Always keep the very newest item (anti-self-delete safeguard)
    overall_rank = 1
    OR (
      -- Within video count cap (only applies to video sources; non-video src has video_rank NULL → passes)
      (video_rank IS NULL OR video_rank <= _max_videos)
      AND
      -- Within storage cap
      storage_running_mb <= _max_storage_mb
    );

  -- Delete everything not in keep set, per source
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
$function$;

-- Re-run for every user to fix any wrongly-pruned state
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
