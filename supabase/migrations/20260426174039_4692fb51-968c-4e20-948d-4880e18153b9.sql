-- Add Talking-Head columns to composer_scenes
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS character_image_url TEXT,
  ADD COLUMN IF NOT EXISTS character_audio_url TEXT,
  ADD COLUMN IF NOT EXISTS character_voice_id TEXT,
  ADD COLUMN IF NOT EXISTS character_script TEXT,
  ADD COLUMN IF NOT EXISTS talking_head_aspect TEXT DEFAULT '9:16',
  ADD COLUMN IF NOT EXISTS talking_head_resolution TEXT DEFAULT '720p';

-- Add index for querying talking-head scenes
CREATE INDEX IF NOT EXISTS idx_composer_scenes_talking_head 
  ON public.composer_scenes(project_id) 
  WHERE clip_source = 'talking-head';

COMMENT ON COLUMN public.composer_scenes.character_image_url IS 'Reference image of the character for Hedra Character-3 lip-sync generation';
COMMENT ON COLUMN public.composer_scenes.character_audio_url IS 'Pre-recorded audio for lip-sync (alternative to TTS via voice_id + script)';
COMMENT ON COLUMN public.composer_scenes.character_voice_id IS 'ElevenLabs voice ID for TTS-based talking-head generation';
COMMENT ON COLUMN public.composer_scenes.character_script IS 'Text spoken by the character (used with voice_id for TTS)';