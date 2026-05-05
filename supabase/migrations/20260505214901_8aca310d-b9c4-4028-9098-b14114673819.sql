-- =========================================================
-- Auto-save AI generations into the video library + backfill
-- =========================================================

CREATE OR REPLACE FUNCTION public.auto_save_ai_video_to_library()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
BEGIN
  -- Only act when generation is completed and has a video URL
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.video_url IS NULL OR length(NEW.video_url) = 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: skip if a video_creations entry already references this generation
  SELECT id INTO v_existing
  FROM public.video_creations
  WHERE user_id = NEW.user_id
    AND metadata @> jsonb_build_object('ai_generation_id', NEW.id::text)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.video_creations (
    user_id,
    output_url,
    status,
    credits_used,
    created_at,
    updated_at,
    metadata
  ) VALUES (
    NEW.user_id,
    NEW.video_url,
    'completed',
    0,
    COALESCE(NEW.created_at, now()),
    now(),
    jsonb_build_object(
      'ai_generation_id', NEW.id::text,
      'model',           NEW.model,
      'prompt',          NEW.prompt,
      'aspect_ratio',    NEW.aspect_ratio,
      'resolution',      NEW.resolution,
      'duration_seconds',NEW.duration_seconds,
      'source',          'sora-2-ai'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break the generation flow if save fails
  RAISE WARNING 'auto_save_ai_video_to_library failed for generation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_save_ai_video_to_library_trg ON public.ai_video_generations;
CREATE TRIGGER auto_save_ai_video_to_library_trg
AFTER INSERT OR UPDATE OF status, video_url ON public.ai_video_generations
FOR EACH ROW
EXECUTE FUNCTION public.auto_save_ai_video_to_library();

-- =========================================================
-- One-shot backfill: recover all missing AI videos for ALL users
-- =========================================================
INSERT INTO public.video_creations (
  user_id, output_url, status, credits_used, created_at, updated_at, metadata
)
SELECT
  g.user_id,
  g.video_url,
  'completed',
  0,
  g.created_at,
  now(),
  jsonb_build_object(
    'ai_generation_id', g.id::text,
    'model',           g.model,
    'prompt',          g.prompt,
    'aspect_ratio',    g.aspect_ratio,
    'resolution',      g.resolution,
    'duration_seconds',g.duration_seconds,
    'source',          'sora-2-ai'
  )
FROM public.ai_video_generations g
WHERE g.status = 'completed'
  AND g.video_url IS NOT NULL
  AND length(g.video_url) > 0
  AND g.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.video_creations vc
    WHERE vc.user_id = g.user_id
      AND vc.metadata @> jsonb_build_object('ai_generation_id', g.id::text)
  );

-- Re-run library cap enforcement for all touched users (keeps newest 500 / 10 GB)
DO $$
DECLARE
  uid uuid;
BEGIN
  FOR uid IN
    SELECT DISTINCT user_id
    FROM public.ai_video_generations
    WHERE status = 'completed' AND video_url IS NOT NULL AND user_id IS NOT NULL
  LOOP
    PERFORM public.enforce_user_video_library_limits(uid, 500, 10240);
  END LOOP;
END $$;