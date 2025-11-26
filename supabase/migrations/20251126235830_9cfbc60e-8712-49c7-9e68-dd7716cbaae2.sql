-- Add storage_url column to universal_audio_assets table
ALTER TABLE universal_audio_assets
ADD COLUMN IF NOT EXISTS storage_url TEXT;