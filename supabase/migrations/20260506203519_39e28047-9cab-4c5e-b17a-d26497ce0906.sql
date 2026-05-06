
-- 1) Idempotent archive function: insert composer scene into video_creations if missing
CREATE OR REPLACE FUNCTION public.archive_composer_scene_to_library(_scene_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_project_id uuid;
  v_project_title text;
  v_clip_url text;
  v_clip_source text;
  v_order_index int;
  v_duration int;
  v_prompt text;
  v_ref_url text;
  v_exists uuid;
BEGIN
  SELECT cs.project_id, cs.clip_url, cs.clip_source, cs.order_index,
         cs.duration_seconds, cs.ai_prompt, cs.reference_image_url,
         cp.user_id, cp.title
  INTO v_project_id, v_clip_url, v_clip_source, v_order_index,
       v_duration, v_prompt, v_ref_url, v_user_id, v_project_title
  FROM composer_scenes cs
  JOIN composer_projects cp ON cp.id = cs.project_id
  WHERE cs.id = _scene_id
    AND cs.clip_status = 'ready'
    AND cs.clip_url IS NOT NULL
    AND cs.clip_source LIKE 'ai-%';

  IF v_user_id IS NULL OR v_clip_url IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_exists
  FROM video_creations
  WHERE user_id = v_user_id
    AND metadata @> jsonb_build_object('source','motion-studio-clip','scene_id', _scene_id::text)
  LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN;
  END IF;

  INSERT INTO video_creations (user_id, output_url, status, credits_used, metadata)
  VALUES (
    v_user_id, v_clip_url, 'completed', 0,
    jsonb_build_object(
      'source', 'motion-studio-clip',
      'project_id', v_project_id::text,
      'project_name', v_project_title,
      'scene_id', _scene_id::text,
      'scene_order', COALESCE(v_order_index, 0),
      'prompt', COALESCE(v_prompt, ''),
      'model', v_clip_source,
      'duration_seconds', v_duration,
      'reference_image_url', v_ref_url,
      'superseded', false
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'archive_composer_scene_to_library failed for %: %', _scene_id, SQLERRM;
END;
$$;

-- 2) Trigger function on composer_scenes
CREATE OR REPLACE FUNCTION public.trg_archive_composer_scene()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clip_status = 'ready'
     AND NEW.clip_url IS NOT NULL
     AND NEW.clip_source LIKE 'ai-%' THEN
    PERFORM public.archive_composer_scene_to_library(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS archive_composer_scene_trg ON public.composer_scenes;
CREATE TRIGGER archive_composer_scene_trg
AFTER INSERT OR UPDATE OF clip_status, clip_url ON public.composer_scenes
FOR EACH ROW
EXECUTE FUNCTION public.trg_archive_composer_scene();

-- 3) Backfill last 30 days
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT cs.id
    FROM composer_scenes cs
    JOIN composer_projects cp ON cp.id = cs.project_id
    WHERE cs.clip_status = 'ready'
      AND cs.clip_url IS NOT NULL
      AND cs.clip_source LIKE 'ai-%'
      AND cs.updated_at > now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM video_creations vc
        WHERE vc.user_id = cp.user_id
          AND vc.metadata @> jsonb_build_object('source','motion-studio-clip','scene_id', cs.id::text)
      )
  LOOP
    PERFORM public.archive_composer_scene_to_library(r.id);
  END LOOP;
END $$;
