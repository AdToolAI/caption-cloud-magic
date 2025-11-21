-- Create universal_audio_assets table for background music and sound effects
CREATE TABLE IF NOT EXISTS universal_audio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('music', 'sound_effect', 'voiceover')),
  title TEXT,
  url TEXT,
  storage_path TEXT,
  duration_sec NUMERIC,
  genre TEXT,
  mood TEXT,
  bpm INTEGER,
  source TEXT CHECK (source IN ('upload', 'stock', 'generated')),
  stock_provider TEXT,
  stock_id TEXT,
  thumbnail_url TEXT,
  waveform_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE universal_audio_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own audio assets"
  ON universal_audio_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audio assets"
  ON universal_audio_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own audio assets"
  ON universal_audio_assets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own audio assets"
  ON universal_audio_assets FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_audio_assets_user_type ON universal_audio_assets(user_id, type);
CREATE INDEX idx_audio_assets_source ON universal_audio_assets(source);

-- Add updated_at trigger
CREATE TRIGGER update_audio_assets_updated_at
  BEFORE UPDATE ON universal_audio_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add audio_config to content_projects for audio settings
ALTER TABLE content_projects 
ADD COLUMN IF NOT EXISTS audio_config JSONB DEFAULT '{
  "background_music_id": null,
  "music_volume": 0.3,
  "voiceover_id": null,
  "voiceover_volume": 1.0,
  "sound_effects": []
}'::jsonb;