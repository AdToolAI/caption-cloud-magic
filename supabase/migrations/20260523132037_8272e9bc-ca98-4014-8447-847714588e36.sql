-- Add dialog_mode flag to composer_scenes
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS dialog_mode BOOLEAN NOT NULL DEFAULT false;

-- Auto-detect dialog mode for existing scenes that already have dialog content
UPDATE public.composer_scenes
SET dialog_mode = true
WHERE dialog_mode = false
  AND (
        COALESCE(NULLIF(TRIM(dialog_script), ''), NULL) IS NOT NULL
     OR engine_override IN ('cinematic-sync', 'native-dialogue')
     OR (audio_plan IS NOT NULL AND audio_plan ? 'twoshot')
  );

COMMENT ON COLUMN public.composer_scenes.dialog_mode IS
  'When true, the scene is treated as a dialogue/lip-sync scene: script editor + speaker picker are shown in the UI, and only native-dialogue-capable models (HappyHorse, Kling 3, Veo 3.1) can be selected.';
