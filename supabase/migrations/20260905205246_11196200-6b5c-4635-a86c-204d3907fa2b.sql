ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS calibration_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS calibration_reason text,
  ADD COLUMN IF NOT EXISTS cost_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cost_closed_by uuid,
  ADD COLUMN IF NOT EXISTS cost_closure_reason text,
  ADD COLUMN IF NOT EXISTS late_cost_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_late_check_at timestamptz;

ALTER TABLE public.video_enhance_runs
  DROP CONSTRAINT IF EXISTS video_enhance_runs_calibration_status_check;
ALTER TABLE public.video_enhance_runs
  ADD CONSTRAINT video_enhance_runs_calibration_status_check
  CHECK (calibration_status IN ('ok', 'review'));

ALTER TABLE public.video_enhance_runs
  DROP CONSTRAINT IF EXISTS video_enhance_runs_cost_closure_reason_check;
ALTER TABLE public.video_enhance_runs
  ADD CONSTRAINT video_enhance_runs_cost_closure_reason_check
  CHECK (cost_closed_at IS NULL OR (cost_closure_reason IS NOT NULL AND length(btrim(cost_closure_reason)) > 0));

CREATE INDEX IF NOT EXISTS video_enhance_runs_late_cost_due_idx
  ON public.video_enhance_runs (next_late_check_at)
  WHERE provider_cost_usd_actual IS NULL AND cost_closed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.video_enhance_cost_closure_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.video_enhance_runs(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('close', 'reopen')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  admin_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.video_enhance_cost_closure_audit TO authenticated;
GRANT ALL ON public.video_enhance_cost_closure_audit TO service_role;

ALTER TABLE public.video_enhance_cost_closure_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read cost closure audit"
ON public.video_enhance_cost_closure_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS video_enhance_cost_closure_audit_run_idx
  ON public.video_enhance_cost_closure_audit (run_id, created_at DESC);