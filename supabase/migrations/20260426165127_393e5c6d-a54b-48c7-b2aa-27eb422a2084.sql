
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS hybrid_mode text
    CHECK (hybrid_mode IS NULL OR hybrid_mode IN ('forward', 'backward', 'bridge', 'style-ref')),
  ADD COLUMN IF NOT EXISTS first_frame_url text,
  ADD COLUMN IF NOT EXISTS end_reference_image_url text,
  ADD COLUMN IF NOT EXISTS hybrid_target_scene_id uuid
    REFERENCES public.composer_scenes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_composer_scenes_hybrid_target
  ON public.composer_scenes(hybrid_target_scene_id);

CREATE INDEX IF NOT EXISTS idx_composer_scenes_hybrid_mode
  ON public.composer_scenes(hybrid_mode) WHERE hybrid_mode IS NOT NULL;
