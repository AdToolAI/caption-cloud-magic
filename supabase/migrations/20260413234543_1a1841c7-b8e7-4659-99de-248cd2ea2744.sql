
CREATE TABLE public.news_radar_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  language TEXT NOT NULL DEFAULT 'en',
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.news_radar_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read news cache"
  ON public.news_radar_cache
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage news cache"
  ON public.news_radar_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);
