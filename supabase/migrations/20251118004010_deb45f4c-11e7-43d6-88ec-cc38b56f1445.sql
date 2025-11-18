-- Drop restrictive policies for media-assets bucket
DROP POLICY IF EXISTS "Users can upload own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;

-- Create public policies for media-assets bucket
CREATE POLICY "Public can upload to media-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media-assets');

CREATE POLICY "Public can view media-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media-assets');

CREATE POLICY "Public can update media-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'media-assets');

CREATE POLICY "Public can delete media-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media-assets');