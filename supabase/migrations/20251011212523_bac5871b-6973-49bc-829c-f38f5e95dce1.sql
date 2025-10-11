-- Create trend_entries table to store trending topics
CREATE TABLE public.trend_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  trend_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  popularity_index INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'en',
  category TEXT,
  region TEXT,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trend_bookmarks table for user saved trends
CREATE TABLE public.trend_bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trend_id UUID NOT NULL REFERENCES public.trend_entries(id) ON DELETE CASCADE,
  saved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, trend_id)
);

-- Create trend_ideas table for AI-generated content ideas
CREATE TABLE public.trend_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trend_name TEXT NOT NULL,
  ideas_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trend_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_ideas ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trend_entries (public read)
CREATE POLICY "Anyone can view trend entries"
ON public.trend_entries
FOR SELECT
USING (true);

-- RLS Policies for trend_bookmarks
CREATE POLICY "Users can create own bookmarks"
ON public.trend_bookmarks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own bookmarks"
ON public.trend_bookmarks
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
ON public.trend_bookmarks
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for trend_ideas
CREATE POLICY "Users can create own trend ideas"
ON public.trend_ideas
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own trend ideas"
ON public.trend_ideas
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trend ideas"
ON public.trend_ideas
FOR DELETE
USING (auth.uid() = user_id);

-- Add feature to registry
INSERT INTO public.feature_registry (id, titles_json, description_json, category, route, icon, plan, enabled, "order")
VALUES (
  'trend-radar',
  '{"en": "AI Trend Radar", "de": "KI-Trendradar", "es": "Radar de Tendencias IA"}'::jsonb,
  '{"en": "Discover trending topics and get AI-powered content ideas", "de": "Entdecke Trending-Themen und erhalte KI-gestützte Content-Ideen", "es": "Descubre temas tendencia y obtén ideas de contenido con IA"}'::jsonb,
  'analyze',
  '/trend-radar',
  'TrendingUp',
  'free',
  true,
  60
);