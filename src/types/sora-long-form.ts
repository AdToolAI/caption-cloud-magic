export type TransitionType = 'none' | 'fade' | 'crossfade' | 'slide' | 'zoom' | 'wipe';
export type ModelType = 'sora-2-standard' | 'sora-2-pro';
export type AspectRatio = '16:9' | '9:16' | '1:1';
export type SceneDuration = 4 | 8 | 12;
export type TargetDuration = 30 | 60 | 120;
export type ProjectStatus = 'draft' | 'generating' | 'rendering' | 'completed' | 'failed';
export type SceneStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface Sora2Scene {
  id: string;
  project_id: string;
  scene_order: number;
  duration: SceneDuration;
  prompt: string;
  reference_image_url?: string;
  generated_video_url?: string;
  replicate_prediction_id?: string;
  status: SceneStatus;
  transition_type: TransitionType;
  transition_duration: number;
  cost_euros: number;
  created_at?: string;
  updated_at?: string;
}

export interface Sora2LongFormProject {
  id: string;
  user_id: string;
  name: string;
  target_duration: TargetDuration;
  aspect_ratio: AspectRatio;
  model: ModelType;
  status: ProjectStatus;
  script?: string;
  final_video_url?: string;
  total_cost_euros: number;
  created_at?: string;
  updated_at?: string;
  scenes?: Sora2Scene[];
}

export interface ScriptGeneratorInput {
  idea: string;
  targetDuration: TargetDuration;
  aspectRatio: AspectRatio;
  tone?: string;
  language?: 'de' | 'en';
}

export interface GeneratedScriptScene {
  sceneNumber: number;
  duration: SceneDuration;
  visualPrompt: string;
  narration?: string;
  suggestedTransition: TransitionType;
}

export interface GeneratedScript {
  title: string;
  synopsis: string;
  scenes: GeneratedScriptScene[];
  totalDuration: number;
}

// Cost calculation helpers
export const COST_PER_SECOND = {
  'sora-2-standard': 0.25,
  'sora-2-pro': 0.53,
} as const;

export function calculateSceneCost(duration: SceneDuration, model: ModelType): number {
  return duration * COST_PER_SECOND[model];
}

export function calculateProjectCost(scenes: Pick<Sora2Scene, 'duration'>[], model: ModelType): number {
  return scenes.reduce((total, scene) => total + calculateSceneCost(scene.duration, model), 0);
}

export function getRequiredSceneCount(targetDuration: TargetDuration): number {
  return Math.ceil(targetDuration / 12);
}

export const TRANSITION_OPTIONS: { value: TransitionType; label: string }[] = [
  { value: 'none', label: 'Keine' },
  { value: 'fade', label: 'Fade' },
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'wipe', label: 'Wipe' },
];
