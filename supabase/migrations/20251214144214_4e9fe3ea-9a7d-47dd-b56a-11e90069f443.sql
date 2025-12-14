-- Add new columns for VoicePro audio processing metadata
ALTER TABLE universal_audio_assets
ADD COLUMN IF NOT EXISTS processing_preset TEXT,
ADD COLUMN IF NOT EXISTS effect_config JSONB,
ADD COLUMN IF NOT EXISTS original_audio_url TEXT;