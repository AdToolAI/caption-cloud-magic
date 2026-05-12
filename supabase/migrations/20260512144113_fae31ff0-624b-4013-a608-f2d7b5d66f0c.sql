ALTER TABLE public.brand_characters
  DROP CONSTRAINT IF EXISTS brand_characters_portrait_mode_check;

ALTER TABLE public.brand_characters
  ADD CONSTRAINT brand_characters_portrait_mode_check
  CHECK (portrait_mode = ANY (ARRAY[
    'original'::text,
    'auto_generated'::text,
    'manual_upload'::text,
    'auto_default_outfit'::text
  ]));