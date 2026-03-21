ALTER TABLE public.background_music_tracks 
ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS validation_error TEXT,
ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS validation_attempts INTEGER NOT NULL DEFAULT 0;

-- Mark all existing tracks as pending (they need re-validation)
UPDATE public.background_music_tracks SET validation_status = 'pending' WHERE validation_status IS NULL OR validation_status = 'pending';

-- Also set is_valid = false for existing tracks until validated
UPDATE public.background_music_tracks SET is_valid = false WHERE validation_status != 'validated';