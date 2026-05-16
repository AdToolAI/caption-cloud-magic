-- video-assets: replace permissive INSERT policy with path-ownership check
DROP POLICY IF EXISTS "Users can upload videos" ON storage.objects;
CREATE POLICY "Users can upload to own video-assets folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'video-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- sora-frames: replace permissive INSERT policy with path-ownership check
DROP POLICY IF EXISTS "Allow authenticated users to upload frames" ON storage.objects;
CREATE POLICY "Users can upload to own sora-frames folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sora-frames'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );