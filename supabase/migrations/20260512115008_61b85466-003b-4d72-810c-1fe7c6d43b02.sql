ALTER TABLE public.avatar_wardrobe_variants
  ADD COLUMN IF NOT EXISTS theme_pack TEXT NOT NULL DEFAULT 'lifestyle';

ALTER TABLE public.avatar_wardrobe_variants
  DROP CONSTRAINT IF EXISTS avatar_wardrobe_variants_avatar_id_outfit_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS avatar_wardrobe_variants_avatar_theme_outfit_key
  ON public.avatar_wardrobe_variants (avatar_id, theme_pack, outfit_id);

CREATE INDEX IF NOT EXISTS idx_avatar_wardrobe_theme
  ON public.avatar_wardrobe_variants (avatar_id, theme_pack);