
CREATE TABLE public.news_hub_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  headline TEXT NOT NULL,
  summary TEXT,
  category TEXT NOT NULL DEFAULT 'platform',
  source TEXT,
  source_url TEXT,
  language TEXT NOT NULL DEFAULT 'de',
  batch_id TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_news_hub_articles_published_at ON public.news_hub_articles (published_at DESC);
CREATE INDEX idx_news_hub_articles_category ON public.news_hub_articles (category);
CREATE INDEX idx_news_hub_articles_batch_id ON public.news_hub_articles (batch_id);

ALTER TABLE public.news_hub_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read news articles"
  ON public.news_hub_articles
  FOR SELECT
  TO authenticated
  USING (true);
