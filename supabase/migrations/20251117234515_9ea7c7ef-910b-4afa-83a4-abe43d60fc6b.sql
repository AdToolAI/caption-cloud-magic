-- Create video-assets storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('video-assets', 'video-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policy for authenticated users to upload videos
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Users can upload videos'
  ) THEN
    CREATE POLICY "Users can upload videos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'video-assets');
  END IF;
END $$;

-- Policy for public access to videos
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Videos are publicly accessible'
  ) THEN
    CREATE POLICY "Videos are publicly accessible"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'video-assets');
  END IF;
END $$;

-- Policy for users to delete their own videos
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Users can delete their own videos'
  ) THEN
    CREATE POLICY "Users can delete their own videos"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'video-assets');
  END IF;
END $$;

-- Add new columns to video_templates table
ALTER TABLE video_templates 
  ADD COLUMN IF NOT EXISTS supports_multiple_videos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_video_count integer;

-- Insert new Video Montage template only if it doesn't exist
INSERT INTO video_templates (
  name,
  description,
  category,
  aspect_ratio,
  duration,
  platforms,
  template_config,
  customizable_fields,
  supports_multiple_videos,
  max_video_count
)
SELECT 
  'Video Montage',
  'Erstelle eine dynamische Video-Montage aus 2-3 kurzen Clips mit Übergängen',
  'product',
  '9:16',
  15,
  ARRAY['instagram', 'tiktok', 'youtube'],
  jsonb_build_object(
    'timeline', jsonb_build_object(
      'background', '#000000',
      'tracks', jsonb_build_array(
        jsonb_build_object('clips', jsonb_build_array())
      )
    ),
    'output', jsonb_build_object(
      'format', 'mp4',
      'resolution', 'hd',
      'aspectRatio', '9:16',
      'size', jsonb_build_object(
        'width', 1080,
        'height', 1920
      )
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'key', 'VIDEO_CLIPS',
      'label', 'Video-Clips (2-3 Stück)',
      'type', 'videos',
      'required', true,
      'min_count', 2,
      'max_count', 3,
      'max_size_mb', 100
    ),
    jsonb_build_object(
      'key', 'TITLE_TEXT',
      'label', 'Titel',
      'type', 'text',
      'required', true,
      'maxLength', 30
    ),
    jsonb_build_object(
      'key', 'transition_style',
      'label', 'Übergangseffekt',
      'type', 'transition',
      'required', false,
      'default', 'fade',
      'available_transitions', jsonb_build_array('fade', 'wipe', 'zoom', 'slide')
    )
  ),
  true,
  3
WHERE NOT EXISTS (
  SELECT 1 FROM video_templates WHERE name = 'Video Montage'
);