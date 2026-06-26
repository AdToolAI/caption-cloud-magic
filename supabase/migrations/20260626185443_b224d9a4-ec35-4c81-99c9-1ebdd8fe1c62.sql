
CREATE TABLE public.cross_post_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id text,
  video_url text,
  channel text NOT NULL CHECK (channel IN ('instagram','tiktok','linkedin','youtube')),
  caption text,
  hashtags text[] DEFAULT '{}',
  title text,
  description text,
  tags text[] DEFAULT '{}',
  hook_score numeric,
  tone text DEFAULT 'default',
  language text DEFAULT 'en',
  edited_by_user boolean DEFAULT false,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cross_post_drafts_user_video ON public.cross_post_drafts(user_id, video_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_post_drafts TO authenticated;
GRANT ALL ON public.cross_post_drafts TO service_role;

ALTER TABLE public.cross_post_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cross_post_drafts"
  ON public.cross_post_drafts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_cross_post_drafts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_touch_cross_post_drafts
  BEFORE UPDATE ON public.cross_post_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_cross_post_drafts_updated_at();
