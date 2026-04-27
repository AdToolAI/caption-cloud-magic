-- Snippet sharing columns
ALTER TABLE public.motion_studio_scene_snippets
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cloned_from uuid REFERENCES public.motion_studio_scene_snippets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scene_snippets_public_top
  ON public.motion_studio_scene_snippets (is_public, like_count DESC, usage_count DESC)
  WHERE is_public = true;

-- Allow all authenticated users to SELECT public snippets
DROP POLICY IF EXISTS "Public snippets viewable by authenticated users" ON public.motion_studio_scene_snippets;
CREATE POLICY "Public snippets viewable by authenticated users"
  ON public.motion_studio_scene_snippets
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Likes table
CREATE TABLE IF NOT EXISTS public.motion_studio_snippet_likes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snippet_id uuid NOT NULL REFERENCES public.motion_studio_scene_snippets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, snippet_id)
);

CREATE INDEX IF NOT EXISTS idx_snippet_likes_snippet ON public.motion_studio_snippet_likes(snippet_id);

ALTER TABLE public.motion_studio_snippet_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own likes" ON public.motion_studio_snippet_likes;
CREATE POLICY "Users manage their own likes"
  ON public.motion_studio_snippet_likes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Like count trigger
CREATE OR REPLACE FUNCTION public.handle_snippet_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.motion_studio_scene_snippets
    SET like_count = like_count + 1
    WHERE id = NEW.snippet_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.motion_studio_scene_snippets
    SET like_count = GREATEST(like_count - 1, 0)
    WHERE id = OLD.snippet_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_snippet_like_count_ins ON public.motion_studio_snippet_likes;
CREATE TRIGGER trg_snippet_like_count_ins
  AFTER INSERT ON public.motion_studio_snippet_likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_snippet_like_count();

DROP TRIGGER IF EXISTS trg_snippet_like_count_del ON public.motion_studio_snippet_likes;
CREATE TRIGGER trg_snippet_like_count_del
  AFTER DELETE ON public.motion_studio_snippet_likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_snippet_like_count();

-- Set published_at automatically when going public
CREATE OR REPLACE FUNCTION public.set_snippet_published_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_public = true AND (OLD.is_public IS DISTINCT FROM true OR NEW.published_at IS NULL) THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snippet_published_at ON public.motion_studio_scene_snippets;
CREATE TRIGGER trg_snippet_published_at
  BEFORE UPDATE OR INSERT ON public.motion_studio_scene_snippets
  FOR EACH ROW EXECUTE FUNCTION public.set_snippet_published_at();