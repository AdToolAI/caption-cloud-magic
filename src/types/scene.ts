export interface SceneBackground {
  type: 'color' | 'gradient' | 'image' | 'video';
  color?: string;
  gradientColors?: string[];
  imageUrl?: string;
  videoUrl?: string;
}

export interface SceneTransition {
  type: 'none' | 'fade' | 'crossfade' | 'slide' | 'zoom' | 'wipe' | 'blur' | 'push';
  duration: number; // in seconds
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface SceneOriginalAudio {
  /** Hard mute set in step 2 — always wins over global toggle. */
  muted?: boolean;
  /** Overrides global useOriginalAudio toggle when defined. */
  enabled?: boolean;
  /** Overrides global originalAudioVolume when defined. 0..1 */
  volume?: number;
}

export interface Scene {
  id: string;
  order: number;
  duration: number; // in seconds
  background: SceneBackground;
  transition: SceneTransition;
  backgroundAnimation?: {
    type: 'none' | 'zoomIn' | 'panLeft' | 'panRight' | 'panUp' | 'panDown';
    intensity?: number;
  };
  originalAudio?: SceneOriginalAudio;
}

export interface ScenesConfig {
  scenes: Scene[];
}
