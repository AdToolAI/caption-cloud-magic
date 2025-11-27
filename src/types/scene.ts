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
}

export interface ScenesConfig {
  scenes: Scene[];
}
