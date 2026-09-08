ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS next_provider_poll_at timestamptz;

CREATE INDEX IF NOT EXISTS video_enhance_runs_provider_poll_due_idx
  ON public.video_enhance_runs (status, next_provider_poll_at);