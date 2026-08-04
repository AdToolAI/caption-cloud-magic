CREATE UNIQUE INDEX IF NOT EXISTS video_creations_unique_ai_generation
  ON public.video_creations (user_id, (metadata->>'ai_generation_id'))
  WHERE metadata ? 'ai_generation_id';