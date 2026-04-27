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

/** A reusable story-building block. */
export interface SceneSnippet {
  id: string;
  user_id: string;
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
}

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
