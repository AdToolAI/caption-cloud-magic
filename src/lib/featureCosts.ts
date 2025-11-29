// Feature cost mapping für das Credit-System
export const FEATURE_COSTS = {
  // Content Generation
  CAPTION_GENERATE: 'caption_generate',
  HASHTAG_ANALYZE: 'hashtag_analyze',
  BIO_OPTIMIZE: 'bio_optimize',
  BACKGROUND_GENERATE: 'background_generate',
  COACH_CHAT: 'coach_chat',
  
  // Scheduling
  POST_SCHEDULE: 'post_schedule',
  
  // Analytics
  TREND_FETCH: 'trend_fetch',
  
  // Media Processing
  IMAGE_PROCESS: 'image_process',
  VIDEO_RENDER: 'video_render',
  VIDEO_RENDER_REMOTION: 'video_render_remotion',
  VIDEO_RENDER_SHOTSTACK: 'video_render_shotstack',
  
  // Comments
  COMMENT_ANALYZE: 'comment_analyze',
  
  // Sora 2 Long-Form Video
  SORA_LONGFORM_STANDARD: 'sora_longform_standard',
  SORA_LONGFORM_PRO: 'sora_longform_pro',
} as const;

export type FeatureCost = typeof FEATURE_COSTS[keyof typeof FEATURE_COSTS];

// Estimated credit costs for features
export const ESTIMATED_COSTS: Record<string, number> = {
  caption_generate: 1,
  hashtag_analyze: 1,
  bio_optimize: 2,
  background_generate: 5,
  coach_chat: 1,
  post_schedule: 0,
  trend_fetch: 3,
  image_process: 2,
  video_render: 5,
  video_render_remotion: 5,
  video_render_shotstack: 10,
  comment_analyze: 1,
  // Sora 2 Long-Form costs per second
  sora_longform_standard: 25, // €0.25/sec = 25 credits
  sora_longform_pro: 53,      // €0.53/sec = 53 credits
};

// Calculate Sora 2 Long-Form cost based on total duration
export function calculateSoraLongformCost(
  totalDurationSeconds: number,
  model: 'sora-2-standard' | 'sora-2-pro'
): { credits: number; euros: number } {
  const creditsPerSecond = model === 'sora-2-pro' 
    ? ESTIMATED_COSTS.sora_longform_pro 
    : ESTIMATED_COSTS.sora_longform_standard;
  
  const eurosPerSecond = model === 'sora-2-pro' ? 0.53 : 0.25;
  
  return {
    credits: totalDurationSeconds * creditsPerSecond,
    euros: totalDurationSeconds * eurosPerSecond,
  };
}
