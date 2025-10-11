-- Create campaigns table
CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  topic TEXT NOT NULL,
  tone TEXT NOT NULL,
  audience TEXT,
  duration_weeks INTEGER NOT NULL CHECK (duration_weeks >= 1 AND duration_weeks <= 8),
  platform JSONB NOT NULL DEFAULT '[]'::jsonb,
  post_frequency INTEGER NOT NULL DEFAULT 5 CHECK (post_frequency >= 3 AND post_frequency <= 7),
  summary TEXT,
  ai_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaigns
CREATE POLICY "Users can view own campaigns"
  ON public.campaigns
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own campaigns"
  ON public.campaigns
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaigns"
  ON public.campaigns
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
  ON public.campaigns
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Create campaign_posts table
CREATE TABLE public.campaign_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  day TEXT NOT NULL,
  post_type TEXT NOT NULL,
  title TEXT NOT NULL,
  caption_outline TEXT NOT NULL,
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  cta TEXT,
  best_time TEXT,
  generated_caption_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaign_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaign_posts
CREATE POLICY "Users can view posts from own campaigns"
  ON public.campaign_posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = campaign_posts.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create posts in own campaigns"
  ON public.campaign_posts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = campaign_posts.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete posts from own campaigns"
  ON public.campaign_posts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = campaign_posts.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX idx_campaign_posts_campaign_id ON public.campaign_posts(campaign_id);
CREATE INDEX idx_campaigns_user_id ON public.campaigns(user_id);

-- Add to feature registry
INSERT INTO feature_registry (id, category, route, titles_json, description_json, icon, plan, enabled, "order")
VALUES 
  ('campaigns', 'analyze', '/campaigns',
   '{"en": "AI Campaign Assistant", "de": "KI-Kampagnen-Assistent", "es": "Asistente de Campañas IA"}',
   '{"en": "Plan entire content campaigns with AI-generated strategies", "de": "Plane komplette Content-Kampagnen mit KI-generierten Strategien", "es": "Planifica campañas completas con estrategias generadas por IA"}',
   'CalendarCheck2', 'free', true, 23)
ON CONFLICT (id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  "order" = EXCLUDED."order";