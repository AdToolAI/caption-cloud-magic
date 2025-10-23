/**
 * Provider Interface for Multi-Publish System
 * Note: These types are duplicated here because edge functions cannot import from src/
 */

export type Provider = 'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube' | 'linkedin';

export interface MediaItem {
  type: 'image' | 'video';
  path: string;
  mime: string;
  size: number;
}

export interface PublishResult {
  provider: Provider;
  ok: boolean;
  external_id?: string;
  permalink?: string;
  error_code?: string;
  error_message?: string;
}

export interface ProviderPublisher {
  name: Provider;
  publish: (args: {
    userId: string;
    text: string;
    media?: MediaItem[];
  }) => Promise<PublishResult>;
}
