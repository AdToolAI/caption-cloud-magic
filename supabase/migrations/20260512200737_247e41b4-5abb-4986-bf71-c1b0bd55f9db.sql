CREATE TABLE IF NOT EXISTS public.character_catalog_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_pack text NOT NULL,
  label text NOT NULL,
  image_url text NOT NULL,
  storage_path text,
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (theme_pack, label)
);

ALTER TABLE public.character_catalog_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog: anyone authed can read characters"
  ON public.character_catalog_previews
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_character_catalog_previews_theme_pack
  ON public.character_catalog_previews (theme_pack);