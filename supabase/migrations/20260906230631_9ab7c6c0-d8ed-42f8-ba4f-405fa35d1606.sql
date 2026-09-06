ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS requested_output_quality text,
  ADD COLUMN IF NOT EXISTS executing_topaz_model text,
  ADD COLUMN IF NOT EXISTS interpolation_model text;

COMMENT ON COLUMN public.video_enhance_runs.requested_output_quality IS
  'Topaz encoder contract requested by the customer: efficient | high | master.';
COMMENT ON COLUMN public.video_enhance_runs.executing_topaz_model IS
  'Topaz model code that really ran (e.g. prob-4, rhea-1, nyx-3).';
COMMENT ON COLUMN public.video_enhance_runs.interpolation_model IS
  'Topaz frame-interpolation model id, only set when the frame rate changed.';