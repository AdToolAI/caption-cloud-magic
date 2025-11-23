-- First, update existing rows to valid durations
UPDATE ai_video_generations
SET duration_seconds = CASE
  WHEN duration_seconds <= 6 THEN 4
  WHEN duration_seconds <= 10 THEN 8
  ELSE 12
END
WHERE duration_seconds NOT IN (4, 8, 12);

-- Drop old duration constraint
ALTER TABLE ai_video_generations
  DROP CONSTRAINT IF EXISTS ai_video_generations_duration_seconds_check;

-- Add new constraint for Sora 2 supported durations (4, 8, 12 seconds)
ALTER TABLE ai_video_generations
  ADD CONSTRAINT ai_video_generations_duration_seconds_check
  CHECK (duration_seconds IN (4, 8, 12));