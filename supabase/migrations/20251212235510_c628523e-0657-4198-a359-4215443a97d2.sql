-- Create temporary storage bucket for audio files during transcript generation
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-temp', 'audio-temp', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for audio-temp"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-temp');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload to audio-temp"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audio-temp' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete their temp files
CREATE POLICY "Authenticated users can delete from audio-temp"
ON storage.objects FOR DELETE
USING (bucket_id = 'audio-temp' AND auth.role() = 'authenticated');