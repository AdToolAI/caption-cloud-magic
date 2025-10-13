-- Extend brand_kits table with advanced features
ALTER TABLE public.brand_kits
ADD COLUMN IF NOT EXISTS brand_tone TEXT,
ADD COLUMN IF NOT EXISTS brand_values JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS brand_emotions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS example_caption TEXT,
ADD COLUMN IF NOT EXISTS recommended_hashtags JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS emoji_suggestions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS consistency_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS style_direction TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS target_audience TEXT,
ADD COLUMN IF NOT EXISTS brand_name TEXT;

-- Create index for active brand kits
CREATE INDEX IF NOT EXISTS idx_brand_kits_active ON public.brand_kits(user_id, is_active) WHERE is_active = true;

-- Create function to ensure only one active brand kit per user
CREATE OR REPLACE FUNCTION public.ensure_single_active_brand_kit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.brand_kits
    SET is_active = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for single active brand kit
DROP TRIGGER IF EXISTS ensure_single_active_brand_kit_trigger ON public.brand_kits;
CREATE TRIGGER ensure_single_active_brand_kit_trigger
  BEFORE INSERT OR UPDATE ON public.brand_kits
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_active_brand_kit();

-- Create brand_content_analysis table for consistency scoring
CREATE TABLE IF NOT EXISTS public.brand_content_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id UUID NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  content_id UUID,
  score INTEGER NOT NULL DEFAULT 0,
  feedback JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brand_content_analysis ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can create own content analysis"
  ON public.brand_content_analysis
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own content analysis"
  ON public.brand_content_analysis
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own content analysis"
  ON public.brand_content_analysis
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own content analysis"
  ON public.brand_content_analysis
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_brand_content_analysis_brand_kit ON public.brand_content_analysis(brand_kit_id);
CREATE INDEX IF NOT EXISTS idx_brand_content_analysis_user ON public.brand_content_analysis(user_id);