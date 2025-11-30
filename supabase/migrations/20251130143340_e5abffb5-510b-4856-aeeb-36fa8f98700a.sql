-- Create sora-frames storage bucket for extracted video frames
INSERT INTO storage.buckets (id, name, public)
VALUES ('sora-frames', 'sora-frames', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for sora-frames bucket
CREATE POLICY "Allow authenticated users to upload frames"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sora-frames');

CREATE POLICY "Allow public read access to frames"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'sora-frames');

CREATE POLICY "Allow service role full access to frames"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'sora-frames');