-- Create storage bucket for background music
INSERT INTO storage.buckets (id, name, public)
VALUES ('background-music', 'background-music', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for background-music bucket
CREATE POLICY "Background music are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'background-music');

CREATE POLICY "Users can upload their own background music"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'background-music' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their own background music"
ON storage.objects FOR DELETE
USING (bucket_id = 'background-music' AND auth.uid() IS NOT NULL);