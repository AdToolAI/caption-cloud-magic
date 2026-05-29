INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('normalized-masters', 'normalized-masters', true, 524288000, ARRAY['video/mp4'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read normalized masters" ON storage.objects;
CREATE POLICY "Public read normalized masters"
ON storage.objects FOR SELECT
USING (bucket_id = 'normalized-masters');

DROP POLICY IF EXISTS "Service role manages normalized masters" ON storage.objects;
CREATE POLICY "Service role manages normalized masters"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'normalized-masters')
WITH CHECK (bucket_id = 'normalized-masters');