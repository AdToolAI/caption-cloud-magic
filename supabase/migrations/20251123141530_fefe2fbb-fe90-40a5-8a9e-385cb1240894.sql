-- Create storage bucket for AI-generated videos if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-videos',
  'ai-videos',
  true,
  524288000, -- 500MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;

-- Storage policies for ai-videos bucket
-- Allow users to read all videos (public bucket)
CREATE POLICY "Public Access ai-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'ai-videos');

-- Allow users to upload their own videos
CREATE POLICY "Users can upload own ai-videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ai-videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to update their own videos
CREATE POLICY "Users can update own ai-videos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'ai-videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own videos
CREATE POLICY "Users can delete own ai-videos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'ai-videos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);