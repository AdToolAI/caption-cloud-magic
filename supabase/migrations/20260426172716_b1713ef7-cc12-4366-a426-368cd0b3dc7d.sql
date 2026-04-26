ALTER TABLE public.composer_projects
ADD COLUMN IF NOT EXISTS auto_director_config jsonb;

COMMENT ON COLUMN public.composer_projects.auto_director_config IS 'AI Auto-Director configuration snapshot for reproducibility: { idea, mood, targetDurationSec, sceneCount, enginePreference, voicePreset, musicMood, generatedAt }';

CREATE INDEX IF NOT EXISTS idx_composer_projects_auto_director
  ON public.composer_projects ((auto_director_config IS NOT NULL))
  WHERE auto_director_config IS NOT NULL;