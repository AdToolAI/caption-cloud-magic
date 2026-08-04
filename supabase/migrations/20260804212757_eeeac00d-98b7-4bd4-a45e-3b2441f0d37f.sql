CREATE TABLE public.post_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  workspace_id UUID,
  title TEXT NOT NULL DEFAULT 'Neuer Post',
  format TEXT NOT NULL DEFAULT 'square',
  design JSONB NOT NULL,
  thumbnail_url TEXT,
  brand_kit_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_designs TO authenticated;
GRANT ALL ON public.post_designs TO service_role;

ALTER TABLE public.post_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own post designs"
ON public.post_designs FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_post_designs_user_created ON public.post_designs (user_id, created_at DESC);

CREATE TRIGGER update_post_designs_updated_at
BEFORE UPDATE ON public.post_designs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();