ALTER TABLE public.brand_characters
  ADD COLUMN IF NOT EXISTS rekognition_face_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS rekognition_collection_id text,
  ADD COLUMN IF NOT EXISTS rekognition_indexed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rekognition_portrait_hash text;

CREATE INDEX IF NOT EXISTS idx_brand_characters_rek_collection
  ON public.brand_characters (rekognition_collection_id);