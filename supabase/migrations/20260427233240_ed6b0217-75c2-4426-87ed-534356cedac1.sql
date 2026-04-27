-- Allow authenticated users to upload/update/delete their own files in composer-frames
-- following the project-wide RLS path constraint: user_id must be the first folder segment.

CREATE POLICY "composer_frames_user_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'composer-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "composer_frames_user_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'composer-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'composer-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "composer_frames_user_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'composer-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);