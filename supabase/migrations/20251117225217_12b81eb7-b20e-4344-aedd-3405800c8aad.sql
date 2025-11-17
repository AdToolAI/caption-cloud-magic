-- Video Analytics Tabelle
CREATE TABLE IF NOT EXISTS video_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_creation_id uuid REFERENCES video_creations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Video Shares Tabelle
CREATE TABLE IF NOT EXISTS video_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_creation_id uuid REFERENCES video_creations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  platform text NOT NULL,
  share_url text,
  created_at timestamptz DEFAULT now()
);

-- Erweitere video_creations Tabelle
ALTER TABLE video_creations 
ADD COLUMN IF NOT EXISTS quality text DEFAULT '1080p',
ADD COLUMN IF NOT EXISTS format text DEFAULT 'mp4',
ADD COLUMN IF NOT EXISTS aspect_ratio text DEFAULT '16:9',
ADD COLUMN IF NOT EXISTS framerate integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS file_size bigint,
ADD COLUMN IF NOT EXISTS thumbnail_url text,
ADD COLUMN IF NOT EXISTS share_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS download_count integer DEFAULT 0;

-- Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_video_analytics_user_id ON video_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_video_analytics_creation_id ON video_analytics(video_creation_id);
CREATE INDEX IF NOT EXISTS idx_video_shares_user_id ON video_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_video_shares_creation_id ON video_shares(video_creation_id);
CREATE INDEX IF NOT EXISTS idx_video_creations_user_status ON video_creations(user_id, status);

-- RLS Policies für video_analytics
ALTER TABLE video_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own video analytics"
ON video_analytics FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own video analytics"
ON video_analytics FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS Policies für video_shares
ALTER TABLE video_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own video shares"
ON video_shares FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own video shares"
ON video_shares FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own video shares"
ON video_shares FOR DELETE
USING (auth.uid() = user_id);