CREATE UNIQUE INDEX IF NOT EXISTS video_creations_mirror_unique
  ON public.video_creations (user_id, ((metadata->>'mirrored_from')))
  WHERE metadata ? 'mirrored_from';

CREATE OR REPLACE FUNCTION public.mirror_test_videos_to_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := '8948d3d9-2c5e-4405-9e9c-1624448e7189';
BEGIN
  IF NEW.metadata ? 'mirrored_from' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.video_creations (
    user_id, template_id, customizations, render_id, status, output_url,
    error_message, credits_used, created_at, updated_at, media_assets,
    quality, format, aspect_ratio, framerate, file_size, thumbnail_url,
    progress_stage, progress_percentage, metadata
  ) VALUES (
    v_admin, NEW.template_id, NEW.customizations, NEW.render_id, NEW.status, NEW.output_url,
    NEW.error_message, 0, NEW.created_at, now(), NEW.media_assets,
    NEW.quality, NEW.format, NEW.aspect_ratio, NEW.framerate, NEW.file_size, NEW.thumbnail_url,
    NEW.progress_stage, NEW.progress_percentage,
    COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('mirrored_from', NEW.id::text, 'mirrored_from_user', NEW.user_id::text)
  )
  ON CONFLICT (user_id, ((metadata->>'mirrored_from'))) WHERE metadata ? 'mirrored_from'
  DO UPDATE SET
    status = EXCLUDED.status,
    output_url = EXCLUDED.output_url,
    error_message = EXCLUDED.error_message,
    media_assets = EXCLUDED.media_assets,
    thumbnail_url = EXCLUDED.thumbnail_url,
    file_size = EXCLUDED.file_size,
    progress_stage = EXCLUDED.progress_stage,
    progress_percentage = EXCLUDED.progress_percentage,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_test_videos_to_admin ON public.video_creations;
CREATE TRIGGER trg_mirror_test_videos_to_admin
AFTER INSERT OR UPDATE ON public.video_creations
FOR EACH ROW
WHEN (NEW.user_id = 'ee1f91c5-b61d-4188-8e95-da419e376c59'::uuid)
EXECUTE FUNCTION public.mirror_test_videos_to_admin();