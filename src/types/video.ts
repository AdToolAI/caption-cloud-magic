/**
 * Video Template System Types
 */

export interface CustomizableField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'image' | 'images' | 'video' | 'videos' | 'audio' | 'transition';
  required: boolean;
  default?: string | number;
  maxLength?: number;
  min?: number;
  max?: number;
  multiple?: boolean; // For multi-file upload
  min_count?: number; // Minimum files for 'images' or 'videos' type
  max_count?: number; // Maximum files for 'images' or 'videos' type
  max_size_mb?: number; // Maximum file size in MB for 'videos' type
  available_transitions?: string[]; // For 'transition' type
}

export interface VideoTemplate {
  id: string;
  name: string;
  description: string | null;
  preview_url: string | null;
  thumbnail_url?: string;
  template_config: ShotstackConfig;
  customizable_fields: CustomizableField[];
  platforms: string[];
  aspect_ratio: '9:16' | '16:9' | '1:1';
  duration: number;
  category: 'product' | 'service' | 'event' | 'testimonial' | 'sale';
  created_at: string;
  updated_at: string;
  preview_video_url?: string;
  supports_multiple_images?: boolean;
  max_image_count?: number;
  supports_multiple_videos?: boolean;
  max_video_count?: number;
  supports_video?: boolean;
  has_audio?: boolean;
  default_transition_style?: string;
  available_transitions?: string[];
  tags?: string[];
}

export interface BackgroundMusic {
  url: string;
  volume: number;
  fade_in?: boolean;
  fade_out?: boolean;
}

export interface MediaAsset {
  type: 'image' | 'video';
  url: string;
  order: number;
  field_key: string;
}

export interface VideoCreation {
  id: string;
  user_id: string;
  template_id: string;
  customizations: Record<string, string | number>;
  render_id: string | null;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  output_url: string | null;
  error_message: string | null;
  credits_used: number;
  created_at: string;
  updated_at: string;
  media_assets?: MediaAsset[];
}

// Shotstack API Types
export interface ShotstackConfig {
  timeline: {
    background: string;
    tracks: ShotstackTrack[];
  };
  output: {
    format: 'mp4';
    resolution: 'hd';
    aspectRatio: '9:16' | '16:9' | '1:1';
    size: {
      width: number;
      height: number;
    };
  };
}

export interface ShotstackTrack {
  clips: ShotstackClip[];
}

export interface ShotstackClip {
  asset: ShotstackAsset;
  start: number;
  length: number;
  fit?: string;
  scale?: number;
  position?: string;
  offset?: {
    x?: number;
    y?: number;
  };
  transition?: {
    in?: string;
    out?: string;
  };
  effect?: string;
}

export interface ShotstackAsset {
  type: 'image' | 'html' | 'video';
  src?: string;
  html?: string;
  width?: number;
  height?: number;
}

export interface ShotstackRenderResponse {
  success: boolean;
  message: string;
  response: {
    id: string;
    owner: string;
    url: string;
    status: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';
    data: ShotstackConfig;
  };
}

export interface ShotstackStatusResponse {
  success: boolean;
  message: string;
  response: {
    id: string;
    owner: string;
    url: string | null;
    status: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';
    error?: string;
    duration: number;
    render_time: number;
  };
}
