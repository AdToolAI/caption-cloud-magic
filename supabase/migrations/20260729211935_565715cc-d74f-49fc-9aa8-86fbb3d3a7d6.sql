CREATE TABLE public.autopilot_productions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  brief TEXT NOT NULL,
  genre TEXT NOT NULL DEFAULT 'ad_spot',
  platform TEXT NOT NULL DEFAULT 'instagram_reels',
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  language TEXT NOT NULL DEFAULT 'de',
  target_duration_seconds NUMERIC NOT NULL DEFAULT 20,
  stage TEXT NOT NULL DEFAULT 'brief',
  status TEXT NOT NULL DEFAULT 'idle',
  progress INTEGER NOT NULL DEFAULT 0,
  treatment JSONB NOT NULL DEFAULT '{}'::jsonb,
  research JSONB NOT NULL DEFAULT '{}'::jsonb,
  sound_design JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_kit_id UUID,
  estimated_credits NUMERIC NOT NULL DEFAULT 0,
  spent_credits NUMERIC NOT NULL DEFAULT 0,
  final_video_url TEXT,
  error_message TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.autopilot_production_scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id UUID NOT NULL REFERENCES public.autopilot_productions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  scene_index INTEGER NOT NULL,
  beat TEXT NOT NULL DEFAULT 'body',
  duration_seconds NUMERIC NOT NULL DEFAULT 4,
  grammar JSONB NOT NULL DEFAULT '{}'::jsonb,
  anchor_prompt TEXT,
  motion_prompt TEXT,
  anchor_url TEXT,
  anchor_score INTEGER,
  anchor_attempts INTEGER NOT NULL DEFAULT 0,
  anchor_verdicts JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_url TEXT,
  engine TEXT,
  dialogue JSONB NOT NULL DEFAULT '[]'::jsonb,
  sound_design JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (production_id, scene_index)
);

CREATE TABLE public.autopilot_director_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_id UUID NOT NULL REFERENCES public.autopilot_productions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  stage TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'director',
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  scene_index INTEGER,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_autopilot_productions_user ON public.autopilot_productions (user_id, created_at DESC);
CREATE INDEX idx_autopilot_scenes_production ON public.autopilot_production_scenes (production_id, scene_index);
CREATE INDEX idx_autopilot_log_production ON public.autopilot_director_log (production_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_productions TO authenticated;
GRANT ALL ON public.autopilot_productions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_production_scenes TO authenticated;
GRANT ALL ON public.autopilot_production_scenes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_director_log TO authenticated;
GRANT ALL ON public.autopilot_director_log TO service_role;

ALTER TABLE public.autopilot_productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopilot_production_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopilot_director_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own autopilot productions"
  ON public.autopilot_productions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own autopilot scenes"
  ON public.autopilot_production_scenes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own autopilot log"
  ON public.autopilot_director_log FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_autopilot_productions_updated_at
  BEFORE UPDATE ON public.autopilot_productions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_autopilot_production_scenes_updated_at
  BEFORE UPDATE ON public.autopilot_production_scenes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();