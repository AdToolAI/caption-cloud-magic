-- 1. Gender on brand_characters
ALTER TABLE public.brand_characters
  ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.brand_characters
  DROP CONSTRAINT IF EXISTS brand_characters_gender_check;
ALTER TABLE public.brand_characters
  ADD CONSTRAINT brand_characters_gender_check
  CHECK (gender IS NULL OR gender = ANY (ARRAY['male','female','neutral']));

-- 2. Shared catalog previews (one per theme:sub:outfit:gender)
CREATE TABLE IF NOT EXISTS public.wardrobe_catalog_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_pack text NOT NULL,           -- composite "theme:sub" e.g. "historical:medieval"
  outfit_id text NOT NULL,            -- e.g. "knight"
  outfit_label text NOT NULL,
  gender text NOT NULL,               -- 'male' | 'female'
  image_url text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (theme_pack, outfit_id, gender),
  CONSTRAINT wardrobe_catalog_previews_gender_check
    CHECK (gender = ANY (ARRAY['male','female']))
);

CREATE INDEX IF NOT EXISTS idx_wcp_lookup
  ON public.wardrobe_catalog_previews (theme_pack, gender);

ALTER TABLE public.wardrobe_catalog_previews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Catalog readable by authenticated"
  ON public.wardrobe_catalog_previews;
CREATE POLICY "Catalog readable by authenticated"
  ON public.wardrobe_catalog_previews
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Catalog writable by admins"
  ON public.wardrobe_catalog_previews;
CREATE POLICY "Catalog writable by admins"
  ON public.wardrobe_catalog_previews
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_wcp_updated_at
  BEFORE UPDATE ON public.wardrobe_catalog_previews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Per-user perspective renders
CREATE TABLE IF NOT EXISTS public.wardrobe_perspective_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  avatar_id uuid NOT NULL REFERENCES public.brand_characters(id) ON DELETE CASCADE,
  theme_pack text NOT NULL,
  outfit_id text NOT NULL,
  outfit_label text NOT NULL,
  perspective text NOT NULL,          -- 'front' | 'back' | 'side' | 'top'
  image_url text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (avatar_id, theme_pack, outfit_id, perspective),
  CONSTRAINT wpr_perspective_check
    CHECK (perspective = ANY (ARRAY['front','back','side','top']))
);

CREATE INDEX IF NOT EXISTS idx_wpr_avatar_outfit
  ON public.wardrobe_perspective_renders (avatar_id, theme_pack, outfit_id);

ALTER TABLE public.wardrobe_perspective_renders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own perspective renders"
  ON public.wardrobe_perspective_renders;
CREATE POLICY "Users read own perspective renders"
  ON public.wardrobe_perspective_renders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own perspective renders"
  ON public.wardrobe_perspective_renders;
CREATE POLICY "Users insert own perspective renders"
  ON public.wardrobe_perspective_renders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own perspective renders"
  ON public.wardrobe_perspective_renders;
CREATE POLICY "Users update own perspective renders"
  ON public.wardrobe_perspective_renders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own perspective renders"
  ON public.wardrobe_perspective_renders;
CREATE POLICY "Users delete own perspective renders"
  ON public.wardrobe_perspective_renders
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_wpr_updated_at
  BEFORE UPDATE ON public.wardrobe_perspective_renders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Catalog seed job tracking
CREATE TABLE IF NOT EXISTS public.wardrobe_catalog_seed_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by uuid,
  status text NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  total_slots integer NOT NULL DEFAULT 0,
  completed_slots integer NOT NULL DEFAULT 0,
  failed_slots integer NOT NULL DEFAULT 0,
  error_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wardrobe_catalog_seed_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage seed jobs"
  ON public.wardrobe_catalog_seed_jobs;
CREATE POLICY "Admins manage seed jobs"
  ON public.wardrobe_catalog_seed_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_wcs_updated_at
  BEFORE UPDATE ON public.wardrobe_catalog_seed_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();