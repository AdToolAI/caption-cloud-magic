CREATE TABLE public.autopilot_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  production_id uuid REFERENCES public.autopilot_productions(id) ON DELETE SET NULL,
  brief text NOT NULL,
  strategy jsonb NOT NULL DEFAULT '{}'::jsonb,
  concepts jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_index integer,
  genre text,
  language text NOT NULL DEFAULT 'de',
  aspect_ratio text NOT NULL DEFAULT '9:16',
  target_duration_seconds integer NOT NULL DEFAULT 30,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_ideas TO authenticated;
GRANT ALL ON public.autopilot_ideas TO service_role;
ALTER TABLE public.autopilot_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own autopilot ideas"
  ON public.autopilot_ideas FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.autopilot_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idea_id uuid REFERENCES public.autopilot_ideas(id) ON DELETE CASCADE,
  production_id uuid REFERENCES public.autopilot_productions(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'product',
  user_note text,
  storage_path text NOT NULL,
  public_url text,
  file_name text,
  file_size integer,
  mime_type text,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  usable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_assets TO authenticated;
GRANT ALL ON public.autopilot_assets TO service_role;
ALTER TABLE public.autopilot_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own autopilot assets"
  ON public.autopilot_assets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_autopilot_ideas_user ON public.autopilot_ideas(user_id, created_at DESC);
CREATE INDEX idx_autopilot_assets_idea ON public.autopilot_assets(idea_id);
CREATE INDEX idx_autopilot_assets_user ON public.autopilot_assets(user_id, created_at DESC);

CREATE TRIGGER update_autopilot_ideas_updated_at
  BEFORE UPDATE ON public.autopilot_ideas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_autopilot_assets_updated_at
  BEFORE UPDATE ON public.autopilot_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();