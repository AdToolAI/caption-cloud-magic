ALTER TABLE public.text_studio_conversations
  ADD COLUMN IF NOT EXISTS response_length TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS creativity TEXT NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS reasoning_effort TEXT;