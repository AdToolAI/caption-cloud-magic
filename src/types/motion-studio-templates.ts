// Motion Studio Templates – Types

import type {
  ComposerBriefing,
  ComposerCategory,
  AspectRatio,
  ClipSource,
  ClipQuality,
  SceneType,
  TransitionStyle,
} from '@/types/video-composer';

export type TemplateStyle = 'cinematic' | 'minimal' | 'realistic' | 'documentary' | 'comic';

export interface TemplateSceneSuggestion {
  sceneType: SceneType;
  durationSeconds: number;
  clipSource: ClipSource;
  clipQuality?: ClipQuality;
  aiPrompt?: string;
  transitionType?: TransitionStyle;
  transitionDuration?: number;
}

export interface MotionStudioTemplate {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string;
  use_case: string;
  style: TemplateStyle;
  category: ComposerCategory;
  aspect_ratio: AspectRatio;
  duration_seconds: number;
  thumbnail_url: string | null;
  preview_video_url: string | null;
  briefing_defaults: Partial<ComposerBriefing>;
  scene_suggestions: TemplateSceneSuggestion[];
  tags: string[];
  sort_order: number;
  is_active: boolean;
  is_featured: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export const USE_CASE_LABELS: Record<string, string> = {
  product_launch: 'Product Launch',
  tutorial: 'Tutorial',
  brand_story: 'Brand Story',
  testimonial: 'Testimonial',
  feature_ad: 'Feature Ad',
  transformation: 'Before/After',
  behind_scenes: 'Behind The Scenes',
  quick_tip: 'Quick Tip',
  corporate: 'Corporate',
  lifestyle: 'Lifestyle',
};

export const STYLE_LABELS: Record<TemplateStyle, string> = {
  cinematic: 'Cinematic',
  minimal: 'Minimal',
  realistic: 'Realistic',
  documentary: 'Documentary',
  comic: 'Comic',
};
