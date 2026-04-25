// Motion Studio Pro – Library Types (Phase 1)

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

export const EMPTY_CHARACTER_DRAFT: CharacterDraft = {
  name: '',
  description: '',
  signature_items: '',
  reference_image_url: null,
  reference_image_seed: null,
  voice_id: null,
  tags: [],
};

export const EMPTY_LOCATION_DRAFT: LocationDraft = {
  name: '',
  description: '',
  reference_image_url: null,
  lighting_notes: '',
  tags: [],
};
