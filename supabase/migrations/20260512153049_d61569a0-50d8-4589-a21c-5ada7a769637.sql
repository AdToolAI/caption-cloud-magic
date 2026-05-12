
CREATE TABLE public.avatar_outfit_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  avatar_id uuid NOT NULL REFERENCES public.brand_characters(id) ON DELETE CASCADE,
  name text NOT NULL,
  theme_pack text NOT NULL,
  outfit_id text NOT NULL,
  cover_url text NOT NULL,
  front_url text,
  back_url text,
  side_url text,
  top_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_avatar_outfit_looks_avatar ON public.avatar_outfit_looks(avatar_id);
CREATE INDEX idx_avatar_outfit_looks_user ON public.avatar_outfit_looks(user_id);

ALTER TABLE public.avatar_outfit_looks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own outfit looks" ON public.avatar_outfit_looks
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own outfit looks" ON public.avatar_outfit_looks
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own outfit looks" ON public.avatar_outfit_looks
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own outfit looks" ON public.avatar_outfit_looks
  FOR DELETE USING (auth.uid() = user_id);
