-- Phase 2.1: Create oauth_states table for CSRF token validation
CREATE TABLE IF NOT EXISTS public.oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  csrf_token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_token ON public.oauth_states(csrf_token);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON public.oauth_states(expires_at);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own oauth states" ON public.oauth_states;
CREATE POLICY "Users can create own oauth states"
  ON public.oauth_states FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own oauth states" ON public.oauth_states;
CREATE POLICY "Users can view own oauth states"
  ON public.oauth_states FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Phase 2.2: Create social_profiles table for caching profile data
CREATE TABLE IF NOT EXISTS public.social_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube')),
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_social_profiles_user_provider ON public.social_profiles(user_id, provider);

ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profiles" ON public.social_profiles;
CREATE POLICY "Users can view own profiles"
  ON public.social_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profiles" ON public.social_profiles;
CREATE POLICY "Users can update own profiles"
  ON public.social_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own profiles" ON public.social_profiles;
CREATE POLICY "Users can insert own profiles"
  ON public.social_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Phase 2.3: Extend social_connections with provider_open_id and scope
ALTER TABLE public.social_connections 
ADD COLUMN IF NOT EXISTS provider_open_id TEXT,
ADD COLUMN IF NOT EXISTS scope TEXT;

-- Create unique index for user_id + provider combination
DROP INDEX IF EXISTS idx_social_connections_user_provider;
CREATE UNIQUE INDEX idx_social_connections_user_provider 
ON public.social_connections(user_id, provider);