// Motion Studio Pro – Library Types

export interface MotionStudioCharacter {
  id: string;
  user_id: string;
  name: string;
  description: string;
  signature_items: string;
  reference_image_url: string | null;
  reference_image_seed: string | null;
  voice_id: string | null;
  tags: string[];
  usage_count: number;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MotionStudioLocation {
  id: string;
  user_id: string;
  name: string;
  description: string;
  reference_image_url: string | null;
  lighting_notes: string;
  tags: string[];
  usage_count: number;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A casting / vibe variant of a character (e.g. realistic, cinematic, …). */
export interface CharacterVariant {
  id: string;
  character_id: string;
  user_id: string;
  vibe: string;
  label: string | null;
  image_url: string;
  seed: string | null;
  is_primary: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** A relighted / inpainted variant of a location. */
export interface LocationVariant {
  id: string;
  location_id: string;
  user_id: string;
  vibe: string;
  label: string | null;
  image_url: string;
  seed: string | null;
  is_primary: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Curated category for system snippets (Artlist-style scene library). */
export type SceneSnippetCategory =
  | 'product_hero'
  | 'lifestyle'
  | 'talking_head'
  | 'b_roll_tech'
  | 'establishing'
  | 'transition';

/** A reusable story-building block. */
export interface SceneSnippet {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  name: string;
  description: string;
  prompt: string;
  cast_character_ids: string[];
  location_id: string | null;
  clip_url: string | null;
  last_frame_url: string | null;
  reference_image_url: string | null;
  duration_seconds: number | null;
  tags: string[];
  usage_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  /** True for curated platform-provided templates. */
  is_system?: boolean;
  category?: SceneSnippetCategory | string | null;
  preview_video_url?: string | null;
  thumbnail_url?: string | null;
  sort_order?: number;
  attribution_name?: string | null;
  attribution_url?: string | null;
  source?: string | null;
  /** Community sharing */
  is_public?: boolean;
  like_count?: number;
  cloned_from?: string | null;
  published_at?: string | null;
  /** Client-side: did the current user like this snippet? */
  liked_by_me?: boolean;
  /** Client-side: optional display name of original author. */
  author_name?: string | null;
}

export const SCENE_SNIPPET_CATEGORIES: { id: SceneSnippetCategory; label: string; emoji: string }[] = [
  { id: 'product_hero', label: 'Product Hero', emoji: '📦' },
  { id: 'lifestyle', label: 'Lifestyle', emoji: '☕' },
  { id: 'talking_head', label: 'Talking Head', emoji: '🎤' },
  { id: 'b_roll_tech', label: 'B-Roll Tech', emoji: '💻' },
  { id: 'establishing', label: 'Establishing', emoji: '🌆' },
  { id: 'transition', label: 'Transition', emoji: '✨' },
];

export type CharacterDraft = Omit<
  MotionStudioCharacter,
  'id' | 'user_id' | 'usage_count' | 'created_at' | 'updated_at'
>;

export type LocationDraft = Omit<
  MotionStudioLocation,
  'id' | 'user_id' | 'usage_count' | 'created_at' | 'updated_at'
>;

export type SceneSnippetDraft = Omit<
  SceneSnippet,
  'id' | 'user_id' | 'usage_count' | 'created_at' | 'updated_at'
>;

export const EMPTY_CHARACTER_DRAFT: CharacterDraft = {
  name: '',
  description: '',
  signature_items: '',
  reference_image_url: null,
  reference_image_seed: null,
  voice_id: null,
  tags: [],
  workspace_id: null,
};

export const EMPTY_LOCATION_DRAFT: LocationDraft = {
  name: '',
  description: '',
  reference_image_url: null,
  lighting_notes: '',
  tags: [],
  workspace_id: null,
};
