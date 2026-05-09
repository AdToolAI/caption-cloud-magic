ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS audio_plan jsonb,
  ADD COLUMN IF NOT EXISTS dialog_locked_at timestamptz;

COMMENT ON COLUMN public.composer_scenes.audio_plan IS
  'AudioPlan v1 — Director Console: deterministic per-speaker timing (startSec/endSec), voice, audioUrl. Source of truth for voiceover/lip-sync.';
COMMENT ON COLUMN public.composer_scenes.dialog_locked_at IS
  'Set when audio plan was finalized via TTS. While set, derived ai_prompt rebuilds from audio_plan and cannot be silently overwritten.';