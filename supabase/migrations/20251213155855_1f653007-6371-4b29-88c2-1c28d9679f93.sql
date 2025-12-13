-- Create storage bucket for enhanced audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-studio', 'audio-studio', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for public read access
CREATE POLICY "Public read access for audio-studio"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-studio');

-- Create policy for authenticated upload
CREATE POLICY "Authenticated users can upload to audio-studio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audio-studio' AND auth.role() = 'authenticated');

-- Create policy for authenticated delete
CREATE POLICY "Authenticated users can delete from audio-studio"
ON storage.objects FOR DELETE
USING (bucket_id = 'audio-studio' AND auth.role() = 'authenticated');