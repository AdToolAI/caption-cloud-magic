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
  
  // Comments
  COMMENT_ANALYZE: 'comment_analyze',
} as const;

export type FeatureCost = typeof FEATURE_COSTS[keyof typeof FEATURE_COSTS];

// Estimated credit costs for features
export const ESTIMATED_COSTS: Record<string, number> = {
  caption_generate: 1,
  hashtag_analyze: 1,
  bio_optimize: 2,
  background_generate: 5, // Base cost, varies by variant count
  coach_chat: 1,
  post_schedule: 0,
  trend_fetch: 3,
  image_process: 2,
  video_render: 5,
  comment_analyze: 1,
};
