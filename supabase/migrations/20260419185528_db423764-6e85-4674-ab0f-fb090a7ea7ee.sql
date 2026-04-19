ALTER TABLE public.strategy_posts 
  ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_publish BOOLEAN DEFAULT false;