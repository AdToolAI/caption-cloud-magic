
-- 1. IG analytics tables: restrict SELECT to owner via social_connections
DROP POLICY IF EXISTS "Users can view account daily metrics" ON public.ig_account_daily;
CREATE POLICY "Users can view their own account daily metrics"
ON public.ig_account_daily FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.social_connections sc
  WHERE sc.user_id = auth.uid()
    AND sc.provider = 'instagram'
    AND sc.account_id = ig_account_daily.ig_user_id
));

DROP POLICY IF EXISTS "Users can view media" ON public.ig_media;
CREATE POLICY "Users can view their own media"
ON public.ig_media FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.social_connections sc
  WHERE sc.user_id = auth.uid()
    AND sc.provider = 'instagram'
    AND sc.account_id = ig_media.ig_user_id
));

DROP POLICY IF EXISTS "Users can view media metrics" ON public.ig_media_metrics;
CREATE POLICY "Users can view their own media metrics"
ON public.ig_media_metrics FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.ig_media m
  JOIN public.social_connections sc
    ON sc.provider = 'instagram'
   AND sc.account_id = m.ig_user_id
   AND sc.user_id = auth.uid()
  WHERE m.media_id = ig_media_metrics.media_id
));

-- 2. Template editing sessions: scope to owner
DROP POLICY IF EXISTS "Users can view all active sessions" ON public.template_editing_sessions;
CREATE POLICY "Users can view their own sessions"
ON public.template_editing_sessions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 3. calendar_integrations.google_refresh_token: revoke column access from clients
REVOKE SELECT (google_refresh_token) ON public.calendar_integrations FROM anon, authenticated;

-- 4. webhook_endpoints.secret: revoke column access from clients
REVOKE SELECT (secret) ON public.webhook_endpoints FROM anon, authenticated;

-- 5. Storage: remove permissive video-assets INSERT policy
DROP POLICY IF EXISTS "Users can upload to video-assets" ON storage.objects;

-- 6. Storage: fix voiceover-audio INSERT to enforce folder ownership
DROP POLICY IF EXISTS "Authenticated users can upload voiceover audio" ON storage.objects;
CREATE POLICY "Users can upload own voiceover audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'voiceover-audio'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
