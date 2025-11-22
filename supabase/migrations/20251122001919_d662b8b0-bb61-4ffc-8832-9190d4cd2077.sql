-- Create user_storage_quotas table
CREATE TABLE IF NOT EXISTS public.user_storage_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_mb INTEGER NOT NULL DEFAULT 5120,
  used_mb INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  plan_tier TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add RLS policies for user_storage_quotas
ALTER TABLE public.user_storage_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own storage quota"
  ON public.user_storage_quotas
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own storage quota"
  ON public.user_storage_quotas
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add thumbnail_urls column to content_projects
ALTER TABLE public.content_projects
ADD COLUMN IF NOT EXISTS thumbnail_urls JSONB DEFAULT '{}'::jsonb;

-- Add storage tracking columns to content_projects
ALTER TABLE public.content_projects
ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
ADD COLUMN IF NOT EXISTS file_size_mb NUMERIC DEFAULT 0;

-- Create storage_files table for tracking all uploaded files
CREATE TABLE IF NOT EXISTS public.storage_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_mb NUMERIC NOT NULL DEFAULT 0,
  file_type TEXT,
  project_id UUID REFERENCES public.content_projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ DEFAULT now(),
  is_orphaned BOOLEAN DEFAULT false
);

-- Add RLS policies for storage_files
ALTER TABLE public.storage_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own storage files"
  ON public.storage_files
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own storage files"
  ON public.storage_files
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own storage files"
  ON public.storage_files
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_storage_files_user_id ON public.storage_files(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_files_project_id ON public.storage_files(project_id);
CREATE INDEX IF NOT EXISTS idx_storage_files_bucket_name ON public.storage_files(bucket_name);

-- Create function to initialize storage quota for new users
CREATE OR REPLACE FUNCTION public.initialize_storage_quota()
RETURNS TRIGGER AS $$
DECLARE
  default_quota INTEGER;
BEGIN
  -- Determine quota based on user's plan (from wallets table)
  SELECT CASE 
    WHEN w.plan_code = 'free' THEN 2048
    WHEN w.plan_code = 'pro' THEN 10240
    WHEN w.plan_code = 'enterprise' THEN 51200
    ELSE 2048
  END INTO default_quota
  FROM public.wallets w
  WHERE w.user_id = NEW.id;

  -- If no wallet found, use free plan quota
  IF default_quota IS NULL THEN
    default_quota := 2048;
  END IF;

  INSERT INTO public.user_storage_quotas (user_id, quota_mb, plan_tier)
  VALUES (
    NEW.id,
    default_quota,
    COALESCE((SELECT plan_code FROM public.wallets WHERE user_id = NEW.id), 'free')
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to initialize storage quota
DROP TRIGGER IF EXISTS trigger_initialize_storage_quota ON public.profiles;
CREATE TRIGGER trigger_initialize_storage_quota
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_storage_quota();

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('optimized-videos', 'optimized-videos', true),
  ('thumbnails', 'thumbnails', true),
  ('video-variants', 'video-variants', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for optimized-videos bucket
CREATE POLICY "Users can upload own optimized videos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'optimized-videos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own optimized videos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'optimized-videos');

CREATE POLICY "Users can delete own optimized videos"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'optimized-videos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS policies for thumbnails bucket
CREATE POLICY "Users can upload own thumbnails"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'thumbnails' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view thumbnails"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'thumbnails');

CREATE POLICY "Users can delete own thumbnails"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'thumbnails' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS policies for video-variants bucket
CREATE POLICY "Users can upload own video variants"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'video-variants' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own video variants"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'video-variants');

CREATE POLICY "Users can delete own video variants"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'video-variants' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );