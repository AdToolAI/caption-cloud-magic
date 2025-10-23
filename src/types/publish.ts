/**
 * Multi-Publish System Types
 */

export type Provider = 
  | 'instagram' 
  | 'facebook' 
  | 'tiktok' 
  | 'x' 
  | 'youtube' 
  | 'linkedin';

export interface MediaItem {
  type: 'image' | 'video';
  path: string;
  mime: string;
  size: number;
}

export interface PublishPayload {
  text: string;
  media?: MediaItem[];
  channels: Provider[];
}

export interface PublishResult {
  provider: Provider;
  ok: boolean;
  external_id?: string;
  permalink?: string;
  error_code?: string;
  error_message?: string;
}

// Database record types
export interface PublishJob {
  id: string;
  user_id: string;
  text_content: string | null;
  media: MediaItem[];
  channels: Provider[];
  created_at: string;
}

export interface PublishResultRecord {
  id: string;
  job_id: string;
  provider: Provider;
  ok: boolean;
  external_id: string | null;
  permalink: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}
