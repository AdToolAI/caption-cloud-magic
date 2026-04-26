-- Add batch_id to composer_exports for grouping multi-format batch exports
ALTER TABLE public.composer_exports
ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_composer_exports_batch_id 
ON public.composer_exports(batch_id) 
WHERE batch_id IS NOT NULL;