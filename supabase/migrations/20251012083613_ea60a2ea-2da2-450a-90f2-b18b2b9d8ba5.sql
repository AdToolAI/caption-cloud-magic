-- Create storage bucket for media assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('media-assets', 'media-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for media-assets bucket
CREATE POLICY "Users can upload own media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'media-assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'media-assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media-assets' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );