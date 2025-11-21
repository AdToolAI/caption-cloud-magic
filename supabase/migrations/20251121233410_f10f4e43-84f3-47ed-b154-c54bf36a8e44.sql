-- Phase 30: Video Production Pipeline Enhancement - Database Schema (Corrected)

-- Drop existing video_variants table (it was for A/B testing, we need it for video formats)
DROP TABLE IF EXISTS video_variants CASCADE;

-- 1. Add progress tracking columns to video_creations
ALTER TABLE video_creations 
ADD COLUMN IF NOT EXISTS progress_stage TEXT DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS progress_percentage DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS stage_details JSONB;

-- 2. Add compression tracking columns
ALTER TABLE video_creations
ADD COLUMN IF NOT EXISTS compression_settings JSONB,
ADD COLUMN IF NOT EXISTS original_file_size_mb DECIMAL,
ADD COLUMN IF NOT EXISTS compressed_file_size_mb DECIMAL,
ADD COLUMN IF NOT EXISTS compression_ratio DECIMAL;

-- 3. Add thumbnail columns (some already exist)
ALTER TABLE video_creations
ADD COLUMN IF NOT EXISTS thumbnail_timestamp_sec DECIMAL,
ADD COLUMN IF NOT EXISTS custom_thumbnail_uploaded BOOLEAN DEFAULT FALSE;

-- 4. Add retry tracking columns
ALTER TABLE video_creations
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_error_message TEXT;

-- 5. Add render_id and output_url to render_queue if not exists
ALTER TABLE render_queue
ADD COLUMN IF NOT EXISTS render_id TEXT,
ADD COLUMN IF NOT EXISTS output_url TEXT,
ADD COLUMN IF NOT EXISTS render_data JSONB;

-- 6. Create video_variants table for multi-format support (video format variants, not A/B test variants)
CREATE TABLE video_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_creation_id UUID NOT NULL REFERENCES video_creations(id) ON DELETE CASCADE,
  variant_type TEXT NOT NULL,
  format TEXT,
  resolution TEXT,
  aspect_ratio TEXT,
  file_url TEXT NOT NULL,
  file_size_mb DECIMAL,
  duration_sec DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Create indexes
CREATE INDEX idx_video_variants_creation ON video_variants(video_creation_id);
CREATE INDEX idx_video_variants_type ON video_variants(variant_type);
CREATE INDEX IF NOT EXISTS idx_video_creations_progress_stage ON video_creations(progress_stage);
CREATE INDEX IF NOT EXISTS idx_video_creations_retry_count ON video_creations(retry_count);
CREATE INDEX IF NOT EXISTS idx_render_queue_render_id ON render_queue(render_id);

-- 8. Add storage quota tracking to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS storage_used_mb DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS storage_limit_mb DECIMAL DEFAULT 10000;

-- 9. Enable Row Level Security on video_variants
ALTER TABLE video_variants ENABLE ROW LEVEL SECURITY;

-- 10. Create RLS policies for video_variants
CREATE POLICY "Users can view their own video variants"
ON video_variants
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM video_creations 
    WHERE video_creations.id = video_variants.video_creation_id 
    AND video_creations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own video variants"
ON video_variants
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM video_creations 
    WHERE video_creations.id = video_variants.video_creation_id 
    AND video_creations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own video variants"
ON video_variants
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM video_creations 
    WHERE video_creations.id = video_variants.video_creation_id 
    AND video_creations.user_id = auth.uid()
  )
);

-- 11. Add updated_at trigger for video_variants
CREATE TRIGGER update_video_variants_updated_at
BEFORE UPDATE ON video_variants
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 12. Enable realtime for tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'video_creations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE video_creations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'render_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE render_queue;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'video_variants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE video_variants;
  END IF;
END $$;