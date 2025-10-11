-- Create enum for goal types
CREATE TYPE public.goal_type AS ENUM (
  'followers',
  'posts_per_month',
  'engagement_rate',
  'content_created',
  'revenue'
);

-- Create enum for goal status
CREATE TYPE public.goal_status AS ENUM (
  'active',
  'completed',
  'paused',
  'failed'
);

-- Create social_goals table
CREATE TABLE public.social_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  goal_type public.goal_type NOT NULL,
  target_value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  current_value NUMERIC DEFAULT 0,
  progress_percent NUMERIC DEFAULT 0,
  ai_estimate TEXT,
  status public.goal_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.social_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own goals"
  ON public.social_goals
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own goals"
  ON public.social_goals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals"
  ON public.social_goals
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goals"
  ON public.social_goals
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_social_goals_updated_at
  BEFORE UPDATE ON public.social_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();