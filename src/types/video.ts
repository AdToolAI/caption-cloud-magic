/**
 * Video Template System Types
 */

export interface CustomizableField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'image';
  required: boolean;
  default?: string | number;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface VideoTemplate {
  id: string;
  name: string;
  description: string | null;
  preview_url: string | null;
  template_config: ShotstackConfig;
  customizable_fields: CustomizableField[];
  platforms: string[];
  aspect_ratio: '9:16' | '16:9' | '1:1';
  duration: number;
  category: 'product' | 'service' | 'event' | 'testimonial' | 'sale';
  created_at: string;
  updated_at: string;
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
