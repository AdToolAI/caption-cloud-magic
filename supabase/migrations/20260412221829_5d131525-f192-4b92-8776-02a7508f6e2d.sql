ALTER TABLE ai_video_generations 
  DROP CONSTRAINT ai_video_generations_duration_seconds_check;

ALTER TABLE ai_video_generations 
  ADD CONSTRAINT ai_video_generations_duration_seconds_check 
  CHECK (duration_seconds >= 3 AND duration_seconds <= 180);