-- Create universal-videos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('universal-videos', 'universal-videos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for universal-videos
CREATE POLICY "Users can upload own universal videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'universal-videos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public can view universal videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'universal-videos');

CREATE POLICY "Users can delete own universal videos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'universal-videos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );