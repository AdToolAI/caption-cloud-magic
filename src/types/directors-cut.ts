// Director's Cut Types

export interface DirectorCutProject {
  id: string;
  user_id: string;
  project_name: string;
  source_video_url: string;
  source_video_id: string | null;
  duration_seconds: number | null;
  scene_analysis: SceneAnalysis[];
  applied_effects: AppliedEffects;
  audio_enhancements: AudioEnhancements;
  export_settings: ExportSettings;
  status: ProjectStatus;
  output_url: string | null;
  credits_used: number;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'draft' | 'analyzing' | 'editing' | 'rendering' | 'completed' | 'failed';

export interface SceneAnalysis {
  id: string;
  start_time: number;
  end_time: number;
  thumbnail_url?: string;
  description: string;
  mood: string;
  suggested_effects: SuggestedEffect[];
  ai_suggestions: string[];
}

export interface SuggestedEffect {
  type: 'filter' | 'transition' | 'speed' | 'crop';
  name: string;
  reason: string;
  confidence: number;
}

export interface AppliedEffects {
  global: GlobalEffects;
  scenes: Record<string, SceneEffects>;
}

export interface GlobalEffects {
  filter?: string;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  temperature: number;
  vignette: number;
}

export interface SceneEffects {
  filter?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  speed?: number;
  transition_in?: string;
  transition_out?: string;
}

export interface AudioEnhancements {
  master_volume: number;
  noise_reduction: boolean;
  noise_reduction_level: number;
  auto_ducking: boolean;
  ducking_level: number;
  voice_enhancement: boolean;
  added_sounds: AddedSound[];
}

export interface AddedSound {
  id: string;
  url: string;
  name: string;
  start_time: number;
  volume: number;
  type: 'sfx' | 'music' | 'ambience';
}

export interface ExportSettings {
  quality: 'hd' | '4k';
  format: 'mp4' | 'webm' | 'mov';
  fps: number;
  aspect_ratio: string;
}

// Wizard Step Props
export interface VideoImportStepProps {
  selectedVideo: SelectedVideo | null;
  onVideoSelect: (video: SelectedVideo | null) => void;
}

export interface SceneAnalysisStepProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  isAnalyzing: boolean;
  onStartAnalysis: () => void;
  onApplySuggestions?: (effects: Partial<GlobalEffects>, sceneEffects?: Record<string, SceneEffects>) => void;
  appliedEffects?: GlobalEffects;
}

// Filter name to effect values mapping
export const FILTER_EFFECT_MAPPING: Record<string, Partial<GlobalEffects>> = {
  cinematic: { filter: 'cinematic', saturation: 110, contrast: 110 },
  vibrant: { filter: 'vibrant', saturation: 150, contrast: 105 },
  warm: { filter: 'warm', temperature: 20, saturation: 105 },
  cool: { filter: 'cool', temperature: -15, saturation: 95 },
  vintage: { filter: 'vintage', saturation: 85, contrast: 110 },
  noir: { filter: 'noir', saturation: 0, contrast: 120 },
  muted: { filter: 'muted', saturation: 70, brightness: 105 },
  highkey: { filter: 'highkey', brightness: 115, contrast: 90 },
  lowkey: { filter: 'lowkey', brightness: 85, contrast: 120 },
};

// Available Filters/LUTs
export const AVAILABLE_FILTERS = [
  { id: 'none', name: 'Original', preview: '' },
  { id: 'cinematic', name: 'Cinematic', preview: 'saturate(1.1) contrast(1.1)' },
  { id: 'vintage', name: 'Vintage', preview: 'sepia(0.3) contrast(1.1)' },
  { id: 'noir', name: 'Noir', preview: 'grayscale(1) contrast(1.2)' },
  { id: 'warm', name: 'Warm', preview: 'sepia(0.15) saturate(1.2)' },
  { id: 'cool', name: 'Cool', preview: 'hue-rotate(20deg) saturate(0.9)' },
  { id: 'vibrant', name: 'Vibrant', preview: 'saturate(1.5) contrast(1.05)' },
  { id: 'muted', name: 'Muted', preview: 'saturate(0.7) brightness(1.05)' },
  { id: 'highkey', name: 'High Key', preview: 'brightness(1.15) contrast(0.9)' },
  { id: 'lowkey', name: 'Low Key', preview: 'brightness(0.85) contrast(1.2)' },
] as const;

export type FilterId = typeof AVAILABLE_FILTERS[number]['id'];

// Selected video for import
export interface SelectedVideo {
  id?: string;
  url: string;
  name: string;
  source: 'media_library' | 'upload' | 'universal_creator';
  duration?: number;
  thumbnail_url?: string;
}
