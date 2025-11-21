export interface BackgroundAsset {
  id: string;
  user_id: string;
  type: 'color' | 'gradient' | 'video' | 'image';
  title?: string;
  url?: string;
  storage_path?: string;
  color?: string;
  gradient_colors?: { colors: [string, string]; direction?: string };
  duration_sec?: number;
  thumbnail_url?: string;
  source?: string;
  created_at: string;
  updated_at: string;
}
