ALTER TABLE public.qa_live_runs DROP CONSTRAINT IF EXISTS qa_live_runs_status_check;
ALTER TABLE public.qa_live_runs ADD CONSTRAINT qa_live_runs_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped_budget'::text, 'timeout'::text, 'expected'::text]));