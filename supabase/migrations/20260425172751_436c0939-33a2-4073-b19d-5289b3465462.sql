-- Public storage bucket for last-frame extractions used by Frame-to-Shot Continuity
INSERT INTO storage.buckets (id, name, public)
VALUES ('composer-frames', 'composer-frames', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Anyone can read (public bucket); only service role writes via the edge function.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'composer_frames_public_read'
  ) THEN
    CREATE POLICY composer_frames_public_read
      ON storage.objects FOR SELECT
      USING (bucket_id = 'composer-frames');
  END IF;
END$$;
