-- Migration: Per-Channel Media Parameters + Time Offsets + Storage + Import

-- 1. Media Profiles (channel-specific presets)
CREATE TABLE IF NOT EXISTS media_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('instagram','facebook','tiktok','x','youtube','linkedin')),
  account_id TEXT,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_user ON media_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_mp_provider ON media_profiles(provider);

ALTER TABLE media_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profiles"
  ON media_profiles FOR ALL
  USING (auth.uid() = user_id);

-- 2. Extend publish_jobs for channel offsets
ALTER TABLE publish_jobs
  ADD COLUMN IF NOT EXISTS channel_offsets JSONB;

-- 3. Extend publish_results for transform reports
ALTER TABLE publish_results
  ADD COLUMN IF NOT EXISTS transform_report JSONB;

-- 4. User Storage Quota
CREATE TABLE IF NOT EXISTS user_storage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_mb INT NOT NULL DEFAULT 2048,
  used_mb INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_storage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own storage"
  ON user_storage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own storage"
  ON user_storage FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger: Auto-create storage entry for new users
CREATE OR REPLACE FUNCTION create_user_storage()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_storage (user_id, quota_mb, used_mb)
  VALUES (NEW.id, 2048, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_created_storage
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_storage();

-- 5. Media Assets Catalog
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('upload','url')),
  original_url TEXT,
  storage_path TEXT,
  type TEXT NOT NULL CHECK (type IN ('image','video')),
  mime TEXT,
  size_bytes BIGINT,
  width INT,
  height INT,
  duration_sec INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_user ON media_assets(user_id);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own assets"
  ON media_assets FOR ALL
  USING (auth.uid() = user_id);