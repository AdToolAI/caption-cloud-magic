-- 1) lipsync-plates: remove public read, scope to owner folder + service role
DROP POLICY IF EXISTS "lipsync_plates_public_read" ON storage.objects;

CREATE POLICY "lipsync_plates_owner_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lipsync-plates'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "lipsync_plates_service_read"
ON storage.objects FOR SELECT TO service_role
USING (bucket_id = 'lipsync-plates');

-- 2) talking-head-renders: remove public read, scope to owner folder + service role
DROP POLICY IF EXISTS "Talking head renders are publicly readable" ON storage.objects;

CREATE POLICY "talking_head_renders_owner_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'talking-head-renders'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "talking_head_renders_service_read"
ON storage.objects FOR SELECT TO service_role
USING (bucket_id = 'talking-head-renders');

-- 3) brand_characters: column-level privileges hide biometric identifiers
REVOKE SELECT ON public.brand_characters FROM anon;
REVOKE SELECT ON public.brand_characters FROM authenticated;

GRANT SELECT (
  id, user_id, name, description, reference_image_url, storage_path,
  visual_identity_json, usage_count, is_favorite, archived_at, created_at,
  updated_at, default_voice_id, default_voice_provider, default_voice_name,
  portrait_url, portrait_mode, default_language, default_aspect_ratio,
  marketplace_status, pricing_type, price_credits, revenue_share_percent,
  total_revenue_credits, total_purchases, average_rating, total_ratings,
  published_at, reviewed_at, reviewed_by, rejection_reason, origin_type,
  origin_metadata, license_release_path, nsfw_flag, sample_video_urls,
  voice_sample_url, tags, identity_lock_strength, cloned_from_preset, gender,
  voice_settings, default_performance, brand_kit_id, default_voice_language
) ON public.brand_characters TO authenticated;

GRANT ALL ON public.brand_characters TO service_role;