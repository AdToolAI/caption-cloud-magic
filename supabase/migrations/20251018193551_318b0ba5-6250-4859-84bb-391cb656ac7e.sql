-- TikTok Integration Database Tables

-- 1. tiktok_sync_logs table for tracking sync operations
CREATE TABLE IF NOT EXISTS public.tiktok_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  message TEXT,
  videos_synced INTEGER DEFAULT 0,
  error_details JSONB,
  CONSTRAINT tiktok_sync_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_tiktok_sync_logs_user_id ON public.tiktok_sync_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_sync_logs_synced_at ON public.tiktok_sync_logs(synced_at DESC);

-- RLS Policies
ALTER TABLE public.tiktok_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync logs"
  ON public.tiktok_sync_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sync logs"
  ON public.tiktok_sync_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 2. tiktok_uploads table for optional video upload functionality
CREATE TABLE IF NOT EXISTS public.tiktok_uploads (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  video_title TEXT NOT NULL,
  video_description TEXT,
  tiktok_video_id TEXT,
  tiktok_share_url TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'draft_uploaded', 'published', 'error')),
  error_message TEXT,
  file_size_bytes BIGINT,
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  CONSTRAINT tiktok_uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Index
CREATE INDEX IF NOT EXISTS idx_tiktok_uploads_user_id ON public.tiktok_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_uploads_uploaded_at ON public.tiktok_uploads(uploaded_at DESC);

-- RLS
ALTER TABLE public.tiktok_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own uploads"
  ON public.tiktok_uploads
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own uploads"
  ON public.tiktok_uploads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own uploads"
  ON public.tiktok_uploads
  FOR UPDATE
  USING (auth.uid() = user_id);