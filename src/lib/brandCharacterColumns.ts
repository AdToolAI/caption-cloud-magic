/**
 * Explicit client-safe column list for `public.brand_characters`.
 *
 * SECURITY: the `rekognition_*` columns (AWS Rekognition face ids, collection
 * id, portrait hash, index timestamp) are biometric identifiers. Client roles
 * (`anon`, `authenticated`) no longer hold SELECT privileges on them, so a
 * `select('*')` would fail with a permission error. Always select through this
 * list from browser code; edge functions with the service role may read the
 * full row.
 */
export const BRAND_CHARACTER_CLIENT_COLUMNS = [
  'id',
  'user_id',
  'name',
  'description',
  'reference_image_url',
  'storage_path',
  'visual_identity_json',
  'usage_count',
  'is_favorite',
  'archived_at',
  'created_at',
  'updated_at',
  'default_voice_id',
  'default_voice_provider',
  'default_voice_name',
  'portrait_url',
  'portrait_mode',
  'default_language',
  'default_aspect_ratio',
  'marketplace_status',
  'pricing_type',
  'price_credits',
  'revenue_share_percent',
  'total_revenue_credits',
  'total_purchases',
  'average_rating',
  'total_ratings',
  'published_at',
  'reviewed_at',
  'reviewed_by',
  'rejection_reason',
  'origin_type',
  'origin_metadata',
  'license_release_path',
  'nsfw_flag',
  'sample_video_urls',
  'voice_sample_url',
  'tags',
  'identity_lock_strength',
  'cloned_from_preset',
  'gender',
  'voice_settings',
  'default_performance',
  'brand_kit_id',
  'default_voice_language',
].join(',');
