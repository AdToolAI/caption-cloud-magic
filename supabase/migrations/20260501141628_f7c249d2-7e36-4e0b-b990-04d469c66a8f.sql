-- Add started_at watchdog column for stale-detection of qa_live_runs
ALTER TABLE public.qa_live_runs
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now();

-- Allow 'pending' as initial state (rows are created up-front, then transitioned to running)
ALTER TABLE public.qa_live_runs DROP CONSTRAINT IF EXISTS qa_live_runs_status_check;
ALTER TABLE public.qa_live_runs
  ADD CONSTRAINT qa_live_runs_status_check
  CHECK (status IN ('pending','running','succeeded','failed','expected','skipped_budget','timeout'));

-- Index to quickly fetch all rows of one sweep
CREATE INDEX IF NOT EXISTS qa_live_runs_sweep_id_idx
  ON public.qa_live_runs (sweep_id, provider);
