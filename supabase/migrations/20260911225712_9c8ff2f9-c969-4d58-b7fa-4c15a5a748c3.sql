DROP TRIGGER IF EXISTS trg_mirror_test_videos_to_admin ON public.video_creations;

CREATE OR REPLACE FUNCTION public.mirror_test_videos_to_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := '8948d3d9-2c5e-4405-9e9c-1624448e7189';
BEGIN
  IF NEW.user_id = v_admin THEN
    RETURN NEW;
  END IF;

  -- never mirror a mirror
  IF NEW.metadata ? 'mirrored_from_asset_id' THEN
    RETURN NEW;
  END IF;

  BEGIN
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
        || jsonb_build_object(
             'mirrored_from_asset_id', NEW.id::text,
             'mirrored_from_user_id', NEW.user_id::text,
             'mirror_reason', 'admin_archive'
           )
    )
    ON CONFLICT (user_id, ((metadata->>'mirrored_from_asset_id'))) WHERE metadata ? 'mirrored_from_asset_id'
    DO UPDATE SET
      status = EXCLUDED.status,
      output_url = EXCLUDED.output_url,
      error_message = EXCLUDED.error_message,
      media_assets = EXCLUDED.media_assets,
      quality = EXCLUDED.quality,
      format = EXCLUDED.format,
      aspect_ratio = EXCLUDED.aspect_ratio,
      framerate = EXCLUDED.framerate,
      file_size = EXCLUDED.file_size,
      thumbnail_url = EXCLUDED.thumbnail_url,
      progress_stage = EXCLUDED.progress_stage,
      progress_percentage = EXCLUDED.progress_percentage,
      metadata = EXCLUDED.metadata,
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.video_mirror_errors (
        source_video_id, source_user_id, target_user_id, operation, error_message
      ) VALUES (NEW.id, NEW.user_id, v_admin, TG_OP, SQLERRM);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mirror_videos_to_admin
AFTER INSERT OR UPDATE ON public.video_creations
FOR EACH ROW
WHEN (NEW.user_id <> '8948d3d9-2c5e-4405-9e9c-1624448e7189'::uuid)
EXECUTE FUNCTION public.mirror_test_videos_to_admin();