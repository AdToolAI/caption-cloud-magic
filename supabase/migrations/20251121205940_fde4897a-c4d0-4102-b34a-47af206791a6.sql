-- Phase 15: Social Media Publishing Integration Tables

-- Scheduled Publications Table
CREATE TABLE IF NOT EXISTS public.scheduled_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'linkedin', 'youtube')),
  video_url TEXT NOT NULL,
  caption TEXT,
  title TEXT,
  description TEXT,
  hashtags TEXT[],
  publish_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed', 'cancelled')),
  result_data JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social Media Publications History Table
CREATE TABLE IF NOT EXISTS public.social_media_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_publication_id UUID REFERENCES public.scheduled_publications(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'linkedin', 'youtube', 'facebook', 'x')),
  post_url TEXT,
  external_id TEXT,
  caption TEXT,
  hashtags TEXT[],
  published_at TIMESTAMPTZ DEFAULT NOW(),
  engagement_metrics JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform Credentials Status Table
CREATE TABLE IF NOT EXISTS public.platform_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'linkedin', 'youtube', 'facebook', 'x')),
  is_connected BOOLEAN DEFAULT false,
  token_expires_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Enable RLS
ALTER TABLE public.scheduled_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_media_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scheduled_publications
CREATE POLICY "Users can view their own scheduled publications"
  ON public.scheduled_publications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled publications"
  ON public.scheduled_publications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled publications"
  ON public.scheduled_publications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled publications"
  ON public.scheduled_publications FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for social_media_publications
CREATE POLICY "Users can view their own publications"
  ON public.social_media_publications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own publications"
  ON public.social_media_publications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for platform_credentials
CREATE POLICY "Users can view their own credentials"
  ON public.platform_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own credentials"
  ON public.platform_credentials FOR ALL
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_scheduled_publications_user_id ON public.scheduled_publications(user_id);
CREATE INDEX idx_scheduled_publications_status ON public.scheduled_publications(status);
CREATE INDEX idx_scheduled_publications_publish_at ON public.scheduled_publications(publish_at);
CREATE INDEX idx_social_media_publications_user_id ON public.social_media_publications(user_id);
CREATE INDEX idx_social_media_publications_platform ON public.social_media_publications(platform);
CREATE INDEX idx_platform_credentials_user_platform ON public.platform_credentials(user_id, platform);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_scheduled_publications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER set_scheduled_publications_updated_at
  BEFORE UPDATE ON public.scheduled_publications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scheduled_publications_updated_at();

CREATE TRIGGER set_platform_credentials_updated_at
  BEFORE UPDATE ON public.platform_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();