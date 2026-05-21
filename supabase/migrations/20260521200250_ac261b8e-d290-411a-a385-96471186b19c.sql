ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS dialog_shots jsonb;

CREATE INDEX IF NOT EXISTS idx_composer_scenes_dialog_shots_status
  ON public.composer_scenes ((dialog_shots->>'status'))
  WHERE dialog_shots IS NOT NULL;
