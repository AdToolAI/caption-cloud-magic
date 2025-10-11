-- Create enum for post status
CREATE TYPE post_status AS ENUM ('draft', 'scheduled', 'posted');

-- Create posts table for content calendar
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  caption TEXT,
  image_url TEXT,
  status post_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create calendar_notes table
CREATE TABLE public.calendar_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for posts
CREATE POLICY "Users can view own posts"
  ON public.posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own posts"
  ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON public.posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON public.posts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for calendar_notes
CREATE POLICY "Users can view own notes"
  ON public.calendar_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own notes"
  ON public.calendar_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes"
  ON public.calendar_notes FOR DELETE
  USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Add calendar feature to feature_registry
INSERT INTO public.feature_registry (id, category, route, titles_json, icon, plan, enabled, "order", description_json)
VALUES (
  'calendar',
  'optimize',
  '/calendar',
  '{"en": "Smart Calendar", "de": "Intelligenter Kalender", "es": "Calendario inteligente"}'::jsonb,
  'CalendarDays',
  'pro',
  true,
  25,
  '{"en": "Plan and organize your content visually", "de": "Planen und organisieren Sie Ihre Inhalte visuell", "es": "Planifica y organiza tu contenido visualmente"}'::jsonb
);