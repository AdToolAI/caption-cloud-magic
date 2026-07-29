ALTER TABLE public.autopilot_productions
  ADD COLUMN IF NOT EXISTS voiceover_url text,
  ADD COLUMN IF NOT EXISTS music_url text,
  ADD COLUMN IF NOT EXISTS audio_mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS render_id text,
  ADD COLUMN IF NOT EXISTS refunded_credits numeric NOT NULL DEFAULT 0;

ALTER TABLE public.autopilot_production_scenes
  ADD COLUMN IF NOT EXISTS voiceover_url text,
  ADD COLUMN IF NOT EXISTS voiceover_duration_seconds numeric,
  ADD COLUMN IF NOT EXISTS lipsync_url text,
  ADD COLUMN IF NOT EXISTS spent_credits numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded boolean NOT NULL DEFAULT false;