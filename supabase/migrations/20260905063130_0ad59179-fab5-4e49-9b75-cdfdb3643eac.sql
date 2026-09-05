-- 1. nullable column
ALTER TABLE public.studio_images ADD COLUMN IF NOT EXISTS workflow_type text;
ALTER TABLE public.studio_images ADD COLUMN IF NOT EXISTS source_run_id uuid;

-- 2. backfill (explicit mapping, no blanket default)
UPDATE public.studio_images
SET workflow_type = CASE
  WHEN model_used = 'topaz-dust-scratch' THEN 'restored'
  WHEN model_used = 'topaz-colorization' THEN 'colorized'
  WHEN model_used IN ('topaz-image-upscale', 'clarity-pro', 'clarity-upscaler') THEN 'enhanced'
  WHEN upscale_factor IS NOT NULL THEN 'enhanced'
  WHEN metadata_json->>'editMode' = 'true' THEN 'edited'
  WHEN metadata_json->>'editMode' = 'false' THEN 'generated'
  WHEN id = '124ff480-1fdb-494f-a62d-a05c9f1e1c01' THEN 'uploaded'
  WHEN id = '4e835fc7-378c-40ac-8bdc-f1fe85eb1630' THEN 'generated'
  WHEN source = 'upload' THEN 'uploaded'
  ELSE 'generated'
END
WHERE workflow_type IS NULL;

-- 3. verify: fail loudly if anything is unmapped or invalid
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.studio_images
  WHERE workflow_type IS NULL
     OR workflow_type NOT IN ('generated','edited','enhanced','background','restored','colorized','uploaded');
  IF bad > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows without a valid workflow_type', bad;
  END IF;
END $$;

-- 4. check constraint
ALTER TABLE public.studio_images
  ADD CONSTRAINT studio_images_workflow_type_check
  CHECK (workflow_type IN ('generated','edited','enhanced','background','restored','colorized','uploaded'));

-- 5. NOT NULL, deliberately without a database default
ALTER TABLE public.studio_images ALTER COLUMN workflow_type SET NOT NULL;

-- 6. index for per-user filtering and grouped counts
CREATE INDEX IF NOT EXISTS studio_images_user_workflow_created_idx
  ON public.studio_images (user_id, workflow_type, created_at DESC);