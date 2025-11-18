-- Create storage bucket for voiceover audio
INSERT INTO storage.buckets (id, name, public)
VALUES ('voiceover-audio', 'voiceover-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload voiceover audio
CREATE POLICY "Authenticated users can upload voiceover audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'voiceover-audio');

-- Allow public read access to voiceover audio
CREATE POLICY "Public can read voiceover audio"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'voiceover-audio');

-- Allow users to delete their own voiceover files
CREATE POLICY "Users can delete their own voiceover audio"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'voiceover-audio' AND auth.uid()::text = (storage.foldername(name))[1]);