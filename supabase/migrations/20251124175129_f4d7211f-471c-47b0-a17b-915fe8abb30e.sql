-- Create audio-assets storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-assets',
  'audio-assets',
  true,
  52428800, -- 50MB limit
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/m4a']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Users can upload their own audio files
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can upload their own audio'
  ) THEN
    CREATE POLICY "Users can upload their own audio"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'audio-assets' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

-- RLS Policy: Audio files are publicly accessible for playback
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Audio files are publicly accessible'
  ) THEN
    CREATE POLICY "Audio files are publicly accessible"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'audio-assets');
  END IF;
END $$;

-- RLS Policy: Users can update their own audio files
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can update their own audio'
  ) THEN
    CREATE POLICY "Users can update their own audio"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'audio-assets' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

-- RLS Policy: Users can delete their own audio files
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can delete their own audio'
  ) THEN
    CREATE POLICY "Users can delete their own audio"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'audio-assets' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;