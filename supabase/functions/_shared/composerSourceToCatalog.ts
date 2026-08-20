// ============================================================================
// Composer clip source → canonical pricing-catalog ID (Deno / Edge Functions)
// ----------------------------------------------------------------------------
// The Video Composer books scenes by `clip_source` + `clip_quality`, while
// billing and refunds must use the canonical catalog price of the model that
// is actually called in `compose-video-clips`. This map is the single bridge
// between both worlds — no hand-maintained per-second numbers anymore.
// ============================================================================

export type ClipQuality = 'standard' | 'pro';

/** Maps the model each composer source ACTUALLY calls, per quality tier. */
export const COMPOSER_SOURCE_TO_CATALOG: Record<string, Record<ClipQuality, string>> = {
  // minimax/hailuo-2.3
  'ai-hailuo':     { standard: 'hailuo-standard', pro: 'hailuo-pro' },
  // kwaivgi/kling-v3-omni-video (both tiers call the Omni model)
  'ai-kling':      { standard: 'kling-omni', pro: 'kling-omni' },
  'ai-kling-omni': { standard: 'kling-omni', pro: 'kling-omni' },
  // openai/sora-2 via generate-sora-video
  'ai-sora':       { standard: 'sora-2-standard', pro: 'sora-2-pro' },
  // wan-video/wan-2.5-{t2v,i2v}
  'ai-wan':        { standard: 'wan-standard', pro: 'wan-pro' },
  // bytedance/seedance-1-lite (720p vs 1080p)
  'ai-seedance':   { standard: 'seedance-mini', pro: 'seedance-mini-1080p' },
  // BytePlus ModelArk direct API
  'ai-seedance25': { standard: 'seedance-2-5-480p', pro: 'seedance-2-5' },
  // luma/ray-2-720p
  'ai-luma':       { standard: 'luma-standard', pro: 'luma-pro' },
  // google/veo-3.1-fast (standard) vs google/veo-3.1 (pro)
  'ai-veo':        { standard: 'veo-3.1-fast', pro: 'veo-3.1-pro' },
  'ai-runway':     { standard: 'runway-gen4-aleph', pro: 'runway-gen4-aleph' },
  'ai-pika':       { standard: 'pika-2-2-standard', pro: 'pika-2-2-pro' },
  'ai-happyhorse': { standard: 'happyhorse-standard', pro: 'happyhorse-pro' },
  // Vidu is per-clip (5s flat) — per-second parity handled in clip-costs
  'ai-vidu':       { standard: 'vidu-q2-reference', pro: 'vidu-q2-reference' },
};

/** Sources that are not billed through the video catalog (flat rails). */
export const NON_CATALOG_CLIP_COSTS: Record<string, Record<ClipQuality, number>> = {
  'ai-image':    { standard: 0.01, pro: 0.015 },
  stock:         { standard: 0, pro: 0 },
  'stock-image': { standard: 0, pro: 0 },
  upload:        { standard: 0, pro: 0 },
};
