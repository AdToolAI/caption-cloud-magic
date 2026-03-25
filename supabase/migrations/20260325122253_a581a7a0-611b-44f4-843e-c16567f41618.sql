
-- Table 1: onboarding_profiles
CREATE TABLE public.onboarding_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  niche TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT 'creator',
  platforms TEXT[] NOT NULL DEFAULT '{}',
  posting_goal TEXT NOT NULL DEFAULT 'grow_audience',
  posts_per_week INTEGER NOT NULL DEFAULT 3,
  experience_level TEXT NOT NULL DEFAULT 'beginner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own onboarding profile"
  ON public.onboarding_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own onboarding profile"
  ON public.onboarding_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own onboarding profile"
  ON public.onboarding_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Table 2: starter_week_plans
CREATE TABLE public.starter_week_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  suggested_date DATE NOT NULL,
  suggested_time TIME NOT NULL,
  platform TEXT NOT NULL,
  content_idea TEXT NOT NULL,
  tips TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.starter_week_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own starter plans"
  ON public.starter_week_plans FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own starter plans"
  ON public.starter_week_plans FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own starter plans"
  ON public.starter_week_plans FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own starter plans"
  ON public.starter_week_plans FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
