// Feature cost mapping für das Credit-System
export const FEATURE_COSTS = {
  // Content Generation
  CAPTION_GENERATE: 'caption_generate',
  HASHTAG_ANALYZE: 'hashtag_analyze',
  BIO_OPTIMIZE: 'bio_optimize',
  
  // Scheduling
  POST_SCHEDULE: 'post_schedule',
  
  // Analytics
  TREND_FETCH: 'trend_fetch',
  
  // Media Processing
  IMAGE_PROCESS: 'image_process',
  
  // Comments
  COMMENT_ANALYZE: 'comment_analyze',
} as const;

export type FeatureCost = typeof FEATURE_COSTS[keyof typeof FEATURE_COSTS];
