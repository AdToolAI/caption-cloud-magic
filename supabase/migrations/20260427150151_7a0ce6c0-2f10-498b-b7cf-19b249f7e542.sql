-- Add parent_id and upscale tracking to studio_images
ALTER TABLE public.studio_images 
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.studio_images(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS upscale_factor INTEGER,
  ADD COLUMN IF NOT EXISTS variation_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_studio_images_parent_id ON public.studio_images(parent_id);