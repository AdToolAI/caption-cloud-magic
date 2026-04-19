-- Strategy posts table for Always-On Strategy Mode
CREATE TABLE public.strategy_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID,
  week_start DATE NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  platform TEXT NOT NULL,
  content_idea TEXT NOT NULL,
  caption_draft TEXT,
  hashtags JSONB DEFAULT '[]'::jsonb,
  reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','missed','dismissed','rescheduled')),
  original_scheduled_at TIMESTAMPTZ,
  completed_event_id UUID,
  generation_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_strategy_posts_user_week ON public.strategy_posts(user_id, week_start);
CREATE INDEX idx_strategy_posts_scheduled ON public.strategy_posts(scheduled_at);
CREATE INDEX idx_strategy_posts_status ON public.strategy_posts(status);

ALTER TABLE public.strategy_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own strategy posts" ON public.strategy_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own strategy posts" ON public.strategy_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own strategy posts" ON public.strategy_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own strategy posts" ON public.strategy_posts FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_strategy_posts_updated_at
  BEFORE UPDATE ON public.strategy_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add strategy mode preference columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS strategy_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS strategy_mode_activated_at TIMESTAMPTZ;