export interface SceneBackground {
  type: 'color' | 'gradient' | 'image' | 'video';
  color?: string;
  gradientColors?: string[];
  imageUrl?: string;
  videoUrl?: string;
}

export interface SceneTransition {
  type: 'none' | 'fade' | 'crossfade' | 'slide';
  duration: number; // in seconds
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface Scene {
  id: string;
  order: number;
  duration: number; // in seconds
  background: SceneBackground;
  transition: SceneTransition;
}

export interface ScenesConfig {
  scenes: Scene[];
}
