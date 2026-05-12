
-- =========================================================
-- Stage 1: Cast & World — Buildings + Props + Catalogs
-- =========================================================

-- 1) brand_buildings (analog brand_locations)
CREATE TABLE IF NOT EXISTS public.brand_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  reference_image_url text NOT NULL,
  storage_path text,
  visual_identity_json jsonb DEFAULT '{}'::jsonb,
  tags text[] DEFAULT ARRAY[]::text[],
  usage_count integer NOT NULL DEFAULT 0,
  is_favorite boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_buildings_user
  ON public.brand_buildings(user_id) WHERE archived_at IS NULL;

ALTER TABLE public.brand_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own buildings" ON public.brand_buildings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own buildings" ON public.brand_buildings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own buildings" ON public.brand_buildings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own buildings" ON public.brand_buildings
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_brand_buildings_updated_at
  BEFORE UPDATE ON public.brand_buildings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) brand_props (analog brand_locations)
CREATE TABLE IF NOT EXISTS public.brand_props (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  reference_image_url text NOT NULL,
  storage_path text,
  visual_identity_json jsonb DEFAULT '{}'::jsonb,
  tags text[] DEFAULT ARRAY[]::text[],
  usage_count integer NOT NULL DEFAULT 0,
  is_favorite boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_props_user
  ON public.brand_props(user_id) WHERE archived_at IS NULL;

ALTER TABLE public.brand_props ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own props" ON public.brand_props
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own props" ON public.brand_props
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own props" ON public.brand_props
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own props" ON public.brand_props
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_brand_props_updated_at
  BEFORE UPDATE ON public.brand_props
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Catalog Preview Tabellen (global lesbar, admin-only write)
CREATE TABLE IF NOT EXISTS public.location_catalog_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_pack text NOT NULL,
  label text NOT NULL,
  image_url text NOT NULL,
  storage_path text,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(theme_pack, label)
);
CREATE INDEX IF NOT EXISTS idx_location_catalog_theme
  ON public.location_catalog_previews(theme_pack);

CREATE TABLE IF NOT EXISTS public.building_catalog_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_pack text NOT NULL,
  label text NOT NULL,
  image_url text NOT NULL,
  storage_path text,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(theme_pack, label)
);
CREATE INDEX IF NOT EXISTS idx_building_catalog_theme
  ON public.building_catalog_previews(theme_pack);

CREATE TABLE IF NOT EXISTS public.prop_catalog_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_pack text NOT NULL,
  label text NOT NULL,
  image_url text NOT NULL,
  storage_path text,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(theme_pack, label)
);
CREATE INDEX IF NOT EXISTS idx_prop_catalog_theme
  ON public.prop_catalog_previews(theme_pack);

ALTER TABLE public.location_catalog_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_catalog_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prop_catalog_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog: anyone authed can read locations"
  ON public.location_catalog_previews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Catalog: anyone authed can read buildings"
  ON public.building_catalog_previews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Catalog: anyone authed can read props"
  ON public.prop_catalog_previews FOR SELECT TO authenticated USING (true);

-- Service role bypasses RLS automatically; no insert policy needed for normal users.
