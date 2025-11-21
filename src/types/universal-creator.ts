export interface FormatConfig {
  platform: 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'youtube-shorts' | 'custom';
  aspectRatio: '9:16' | '16:9' | '1:1' | '4:5' | '4:3';
  width: number;
  height: number;
  duration: number;
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
  scriptText: string;
  voiceoverUrl?: string;
  voiceoverConfig?: VoiceoverConfig;
  voiceoverDuration?: number;
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
  animation: 'none' | 'fade' | 'slide' | 'bounce';
  outlineStyle: 'none' | 'stroke' | 'box' | 'box-stroke' | 'glow' | 'shadow';
  outlineColor: string;
  outlineWidth: number;
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
