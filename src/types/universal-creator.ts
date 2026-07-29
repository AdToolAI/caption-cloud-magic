export interface FormatConfig {
  platform: 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'youtube-shorts' | 'custom';
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5' | '4:3';
  width: number;
  height: number;
  duration?: number;
  fps: 30 | 60;
}

export interface VoiceoverConfig {
  voiceId: string;
  voiceName: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  speed: number;
}

export interface ContentConfig {
  scriptText?: string;
  voiceoverUrl?: string;
  voiceoverConfig?: VoiceoverConfig;
  voiceoverDuration?: number;
  actualVoiceoverDuration?: number; // Actual duration from audio metadata
  useVoiceover?: boolean; // Flag to enable/disable voiceover
  voiceoverVolume?: number; // 0–1, default 1.0
  /** Startzeit des Voiceovers auf der Video-Timeline in Sekunden (Float, ms-genau). Default 0. */
  voiceoverStartTime?: number;
  backgroundMusicUrl?: string;
  backgroundMusicVolume?: number;
  /**
   * Optional trim/placement for background music. Field names mirror
   * `AudioClip` (src/types/timeline.ts) so a UCC project imported into
   * Director's Cut keeps its trim values without a mapping layer.
   *   trimStart / trimEnd  — seconds inside the SOURCE track
   *   startTime            — seconds on the video timeline (offset from 0)
   *   loop                 — repeat until video end when true
   */
  backgroundMusicClip?: {
    trimStart: number;
    trimEnd: number;
    startTime: number;
    loop: boolean;
    fadeIn?: number;
    fadeOut?: number;
  };
  /** Global toggle to include original scene-video audio. Default false. */
  useOriginalAudio?: boolean;
  /** Global volume for original scene-video audio when useOriginalAudio=true. 0..1, default 0.6. */
  originalAudioVolume?: number;
}


export interface SubtitleWord {
  text: string;
  startTime: number;
  endTime: number;
}

export interface SubtitleSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  words: SubtitleWord[];
}

export interface SubtitleStyle {
  position: 'top' | 'center' | 'bottom';
  font: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  animation: 'none' | 'fade' | 'slide' | 'bounce' | 'typewriter' | 'highlight' | 'scaleUp' | 'glitch' | 'hormozi';
  animationSpeed: number;
  outlineStyle: 'none' | 'stroke' | 'box' | 'box-stroke' | 'glow' | 'shadow';
  outlineColor: string;
  outlineWidth: number;
  /** Hormozi mode: pill color for highlighted power-words (default #F5C76A gold). */
  highlightColor?: string;
}

export interface SubtitleConfig {
  segments: SubtitleSegment[];
  style: SubtitleStyle;
}

export interface PlatformPreset {
  id: string;
  name: string;
  platform: FormatConfig['platform'];
  description: string;
  formats: Array<{
    label: string;
    aspectRatio: FormatConfig['aspectRatio'];
    width: number;
    height: number;
  }>;
  icon: string;
  color: string;
}
