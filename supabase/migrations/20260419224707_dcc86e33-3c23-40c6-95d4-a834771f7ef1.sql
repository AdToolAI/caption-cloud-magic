ALTER TABLE public.onboarding_profiles
  ADD COLUMN IF NOT EXISTS first_video_prompts JSONB;

COMMENT ON COLUMN public.onboarding_profiles.first_video_prompts IS
  'Cached personalized first-video prompts: [{ prompt, prompt_en, style_hint }, ...] (3 entries)';