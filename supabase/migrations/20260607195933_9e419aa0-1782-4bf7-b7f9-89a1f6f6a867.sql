ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS action_beat jsonb,
  ADD COLUMN IF NOT EXISTS realism_preset text;

COMMENT ON COLUMN public.composer_scenes.action_beat IS
  'Action-First plan: { characterAction, environmentMotion, motionIntensity }. Drives prompt priority + Engine Router.';
COMMENT ON COLUMN public.composer_scenes.realism_preset IS
  'cinematic-spot | documentary | lifestyle-hero — primes Shot-Director + Sync.so tier + color grade.';