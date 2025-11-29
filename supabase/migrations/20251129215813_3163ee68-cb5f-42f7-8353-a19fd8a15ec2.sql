-- Storage bucket für Referenzbilder (Image-to-Video)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-video-reference', 'ai-video-reference', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Benutzer können eigene Bilder hochladen
CREATE POLICY "Users can upload their own reference images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ai-video-reference' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policy: Bilder sind öffentlich lesbar
CREATE POLICY "Reference images are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ai-video-reference');

-- RLS Policy: User can delete their own images
CREATE POLICY "Users can delete their own reference images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ai-video-reference' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Optional: Spalte für source_image_url in ai_video_generations
ALTER TABLE ai_video_generations
ADD COLUMN IF NOT EXISTS source_image_url TEXT;