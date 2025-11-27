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

// Transition Assignment for scene-specific transitions
export interface TransitionAssignment {
  sceneId: string;
  transitionType: string;
  duration: number;
  aiSuggested: boolean;
  confidence?: number;
  reasoning?: string;
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
  transitions?: TransitionAssignment[];
  onTransitionsChange?: (transitions: TransitionAssignment[]) => void;
}

// Filter name to effect values mapping - STRONG VALUES for visible differences
export const FILTER_EFFECT_MAPPING: Record<string, Partial<GlobalEffects>> = {
  cinematic: { filter: 'cinematic', saturation: 135, contrast: 130, brightness: 95 },
  vibrant: { filter: 'vibrant', saturation: 180, contrast: 125, brightness: 105 },
  warm: { filter: 'warm', temperature: 45, saturation: 145, brightness: 105 },
  cool: { filter: 'cool', temperature: -40, saturation: 80, brightness: 96 },
  vintage: { filter: 'vintage', saturation: 60, contrast: 135, brightness: 88 },
  noir: { filter: 'noir', saturation: 5, contrast: 160, brightness: 90 },
  muted: { filter: 'muted', saturation: 45, brightness: 115, contrast: 88 },
  highkey: { filter: 'highkey', brightness: 145, contrast: 75, saturation: 90 },
  lowkey: { filter: 'lowkey', brightness: 65, contrast: 145, saturation: 85 },
};

// Available Filters/LUTs
// STRONG preview CSS for visible filter differences
export const AVAILABLE_FILTERS = [
  { id: 'none', name: 'Original', preview: '' },
  { id: 'cinematic', name: 'Cinematic', preview: 'saturate(1.35) contrast(1.3) brightness(0.95)' },
  { id: 'vintage', name: 'Vintage', preview: 'sepia(0.4) contrast(1.35) brightness(0.88)' },
  { id: 'noir', name: 'Noir', preview: 'grayscale(1) contrast(1.6) brightness(0.9)' },
  { id: 'warm', name: 'Warm', preview: 'sepia(0.35) saturate(1.45) brightness(1.05)' },
  { id: 'cool', name: 'Cool', preview: 'hue-rotate(-40deg) saturate(0.8) brightness(0.96)' },
  { id: 'vibrant', name: 'Vibrant', preview: 'saturate(1.8) contrast(1.25) brightness(1.05)' },
  { id: 'muted', name: 'Muted', preview: 'saturate(0.45) brightness(1.15) contrast(0.88)' },
  { id: 'highkey', name: 'High Key', preview: 'brightness(1.45) contrast(0.75) saturate(0.9)' },
  { id: 'lowkey', name: 'Low Key', preview: 'brightness(0.65) contrast(1.45) saturate(0.85)' },
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
