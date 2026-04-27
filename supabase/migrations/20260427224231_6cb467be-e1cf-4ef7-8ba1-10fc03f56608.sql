CREATE TABLE public.ad_campaign_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.composer_projects(id) ON DELETE CASCADE,
  master_project_id UUID REFERENCES public.composer_projects(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','linkedin','x','youtube')),
  external_post_id TEXT,
  post_url TEXT,
  variant_strategy TEXT,
  posted_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, platform, external_post_id)
);

CREATE INDEX idx_ad_campaign_posts_user ON public.ad_campaign_posts(user_id);
CREATE INDEX idx_ad_campaign_posts_project ON public.ad_campaign_posts(project_id);
CREATE INDEX idx_ad_campaign_posts_master ON public.ad_campaign_posts(master_project_id) WHERE master_project_id IS NOT NULL;

ALTER TABLE public.ad_campaign_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own campaign posts"
  ON public.ad_campaign_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own campaign posts"
  ON public.ad_campaign_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own campaign posts"
  ON public.ad_campaign_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own campaign posts"
  ON public.ad_campaign_posts FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ad_campaign_posts_updated_at
  BEFORE UPDATE ON public.ad_campaign_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();