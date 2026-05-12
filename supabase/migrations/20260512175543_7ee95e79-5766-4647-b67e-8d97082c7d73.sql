
INSERT INTO storage.buckets (id, name, public) VALUES
  ('brand-buildings', 'brand-buildings', false),
  ('brand-props', 'brand-props', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for brand-buildings (user_id first path segment)
CREATE POLICY "Users read own buildings" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'brand-buildings' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own buildings" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brand-buildings' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own buildings" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'brand-buildings' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own buildings" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'brand-buildings' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users read own props" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'brand-props' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own props" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brand-props' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users update own props" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'brand-props' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own props" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'brand-props' AND (auth.uid())::text = (storage.foldername(name))[1]);
