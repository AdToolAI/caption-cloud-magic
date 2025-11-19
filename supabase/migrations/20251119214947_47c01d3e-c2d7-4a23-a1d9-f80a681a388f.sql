-- ============================================
-- Video System Tables Migration
-- Creates hooks, video_variants, and video_analytics tables
-- ============================================

-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS public.video_analytics CASCADE;
DROP TABLE IF EXISTS public.video_variants CASCADE;
DROP TABLE IF EXISTS public.hooks CASCADE;

-- ============================================
-- 1. HOOKS TABLE (Hook Template Library)
-- ============================================
CREATE TABLE public.hooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  formula text NOT NULL,
  category text NOT NULL,
  performance_score integer DEFAULT 50 CHECK (performance_score >= 0 AND performance_score <= 100),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS for hooks
ALTER TABLE public.hooks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for hooks
CREATE POLICY "Users can view their own hooks"
  ON public.hooks FOR SELECT
  USING (auth.uid() = user_id OR is_default = true);

CREATE POLICY "Users can create their own hooks"
  ON public.hooks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own hooks"
  ON public.hooks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hooks"
  ON public.hooks FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for hooks
CREATE INDEX idx_hooks_user_id ON public.hooks(user_id);
CREATE INDEX idx_hooks_category ON public.hooks(category);
CREATE INDEX idx_hooks_is_default ON public.hooks(is_default);

-- ============================================
-- 2. VIDEO VARIANTS TABLE (A/B Testing)
-- ============================================
CREATE TABLE public.video_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.video_creations(id) ON DELETE CASCADE,
  variant_type text NOT NULL,
  hook_version text,
  performance_data jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS for video_variants
ALTER TABLE public.video_variants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for video_variants
CREATE POLICY "Users can view their own video variants"
  ON public.video_variants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own video variants"
  ON public.video_variants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own video variants"
  ON public.video_variants FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own video variants"
  ON public.video_variants FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for video_variants
CREATE INDEX idx_video_variants_user_id ON public.video_variants(user_id);
CREATE INDEX idx_video_variants_parent_id ON public.video_variants(parent_id);

-- ============================================
-- 3. VIDEO ANALYTICS TABLE
-- ============================================
CREATE TABLE public.video_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creation_id uuid REFERENCES public.video_creations(id) ON DELETE CASCADE NOT NULL,
  views integer DEFAULT 0,
  ctr decimal(5,2) DEFAULT 0 CHECK (ctr >= 0 AND ctr <= 100),
  watch_time integer DEFAULT 0,
  engagement_rate decimal(5,2) DEFAULT 0 CHECK (engagement_rate >= 0 AND engagement_rate <= 100),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS for video_analytics
ALTER TABLE public.video_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for video_analytics
CREATE POLICY "Users can view their own video analytics"
  ON public.video_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own video analytics"
  ON public.video_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own video analytics"
  ON public.video_analytics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own video analytics"
  ON public.video_analytics FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for video_analytics
CREATE INDEX idx_video_analytics_user_id ON public.video_analytics(user_id);
CREATE INDEX idx_video_analytics_creation_id ON public.video_analytics(creation_id);

-- ============================================
-- 4. DEFAULT HOOK TEMPLATES
-- ============================================
INSERT INTO public.hooks (title, formula, category, is_default, performance_score) VALUES
  ('Problem Awareness Hook', 'Struggling with [Problem]? Here''s what you need to know...', 'Problem Awareness', true, 85),
  ('Shocking Statistic', '[X]% of people don''t know this about [Topic]...', 'Statistik', true, 78),
  ('Pattern Interrupt', 'Stop! Before you [Action], watch this...', 'Pattern Interrupt', true, 82),
  ('Superlative Claim', 'The #1 mistake people make with [Topic]...', 'Superlative', true, 75),
  ('Before vs After', 'From [Bad State] to [Good State] in [Timeframe]...', 'Comparison', true, 80),
  ('Question Hook', 'What if I told you [Surprising Fact]?', 'Problem Awareness', true, 72),
  ('Curiosity Gap', 'This [Thing] changed everything. Here''s how...', 'Pattern Interrupt', true, 77),
  ('Direct Address', 'If you''re [Target Audience], you need to see this...', 'Problem Awareness', true, 74),
  ('Urgency Hook', 'Only [Timeframe] left to [Benefit]. Don''t miss out...', 'Superlative', true, 70),
  ('Social Proof', '[Number] people already did this. Here''s why...', 'Statistik', true, 76),
  ('Myth Buster', 'Everyone thinks [Common Belief], but the truth is...', 'Problem Awareness', true, 79),
  ('List Hook', '[Number] ways to [Achieve Goal] that actually work...', 'Superlative', true, 73);

-- ============================================
-- 5. TRIGGERS FOR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_hooks_updated_at
  BEFORE UPDATE ON public.hooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_variants_updated_at
  BEFORE UPDATE ON public.video_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_analytics_updated_at
  BEFORE UPDATE ON public.video_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();