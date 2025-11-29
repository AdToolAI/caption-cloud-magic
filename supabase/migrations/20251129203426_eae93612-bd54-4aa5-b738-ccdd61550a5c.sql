-- Fix: RLS Policies für video-assets Bucket korrekt erstellen
-- Lösche fehlerhafte Policies falls vorhanden
DROP POLICY IF EXISTS "Users can upload to video-assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can read video-assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own video-assets" ON storage.objects;

-- Erstelle INSERT Policy für video-assets
CREATE POLICY "Users can upload to video-assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'video-assets');

-- Erstelle SELECT Policy für video-assets (public lesbar)
CREATE POLICY "Users can read video-assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'video-assets');

-- Erstelle DELETE Policy für video-assets (nur eigene Dateien)
CREATE POLICY "Users can delete own video-assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'video-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);