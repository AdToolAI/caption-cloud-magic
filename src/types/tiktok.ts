export interface TikTokProfile {
  id: string;
  user_id: string;
  provider: 'tiktok';
  username?: string;
  display_name: string;
  avatar_url: string;
  follower_count: number;
  following_count: number;
  video_count: number;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface TikTokConnection {
  id: string;
  user_id: string;
  provider: 'tiktok';
  provider_open_id: string;
  scope: string;
  account_name: string;
  token_expires_at: string;
  last_sync_at: string;
  created_at: string;
}
