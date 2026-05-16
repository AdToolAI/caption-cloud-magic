
-- ============= media-assets bucket: lock down writes =============
DROP POLICY IF EXISTS "Public can upload to media-assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can update media-assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete media-assets" ON storage.objects;

CREATE POLICY "Users can upload own media-assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media-assets'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own media-assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'media-assets'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own media-assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'media-assets'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- ============= video-assets bucket: remove duplicate over-permissive delete =============
DROP POLICY IF EXISTS "Users can delete their own videos" ON storage.objects;
-- Ownership-scoped "Users can delete own video-assets" already exists and is kept.

-- ============= audio-studio bucket: ownership enforcement =============
DROP POLICY IF EXISTS "Authenticated users can upload to audio-studio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from audio-studio" ON storage.objects;
DROP POLICY IF EXISTS "Audio studio publicly accessible" ON storage.objects;

CREATE POLICY "Users can read own audio-studio"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'audio-studio'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload own audio-studio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'audio-studio'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own audio-studio"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'audio-studio'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own audio-studio"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'audio-studio'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- ============= audio-temp bucket: ownership enforcement =============
DROP POLICY IF EXISTS "Authenticated users can upload to audio-temp" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from audio-temp" ON storage.objects;
DROP POLICY IF EXISTS "Audio temp publicly accessible" ON storage.objects;

CREATE POLICY "Users can read own audio-temp"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'audio-temp'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload own audio-temp"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'audio-temp'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own audio-temp"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'audio-temp'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- ============= background-music bucket: admin-only writes =============
DROP POLICY IF EXISTS "Users can upload their own background music" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own background music" ON storage.objects;

CREATE POLICY "Admins can upload background-music"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'background-music'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update background-music"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'background-music'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete background-music"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'background-music'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- ============= background_music_tracks: enable RLS =============
ALTER TABLE public.background_music_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read background music tracks"
ON public.background_music_tracks FOR SELECT
USING (true);

CREATE POLICY "Admins can manage background music tracks"
ON public.background_music_tracks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============= realtime.messages: block anonymous channel subscribers =============
-- Adds authenticated-only policies so anonymous JWTs can no longer subscribe/broadcast.
-- Per-topic ownership restrictions remain an application-specific follow-up.
DROP POLICY IF EXISTS "Authenticated users can read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can write realtime messages" ON realtime.messages;

CREATE POLICY "Authenticated users can read realtime messages"
ON realtime.messages FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can write realtime messages"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (true);
