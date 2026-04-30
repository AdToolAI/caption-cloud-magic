INSERT INTO storage.buckets (id, name, public)
VALUES ('talking-head-renders', 'talking-head-renders', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Talking head renders are publicly readable"
ON storage.objects
FOR SELECT
USING (bucket_id = 'talking-head-renders');

CREATE POLICY "Users can upload to their own talking head folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'talking-head-renders'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Service role can manage all talking head renders"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'talking-head-renders')
WITH CHECK (bucket_id = 'talking-head-renders');