-- 1. Create composer-uploads bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'composer-uploads',
  'composer-uploads',
  true,
  209715200, -- 200 MB
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 209715200,
  allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'];

-- 2. RLS policies for composer-uploads (path: {userId}/{projectId}/{sceneId}.ext)
DROP POLICY IF EXISTS "composer_uploads_select" ON storage.objects;
CREATE POLICY "composer_uploads_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'composer-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "composer_uploads_insert" ON storage.objects;
CREATE POLICY "composer_uploads_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'composer-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "composer_uploads_update" ON storage.objects;
CREATE POLICY "composer_uploads_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'composer-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "composer_uploads_delete" ON storage.objects;
CREATE POLICY "composer_uploads_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'composer-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. Add upload_type column to composer_scenes
ALTER TABLE public.composer_scenes
ADD COLUMN IF NOT EXISTS upload_type text CHECK (upload_type IN ('video', 'image'));