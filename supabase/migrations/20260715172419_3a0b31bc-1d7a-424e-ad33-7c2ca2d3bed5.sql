
-- 1. Extensions for scheduled dispatch
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Render queue slot-bookkeeping + founders flag
ALTER TABLE public.render_queue
  ADD COLUMN IF NOT EXISTS estimated_workers int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;

-- 3. Dispatch index (queued rows, ordered by priority then age)
CREATE INDEX IF NOT EXISTS idx_render_queue_dispatch
  ON public.render_queue (priority ASC, created_at ASC)
  WHERE status = 'queued';

-- 4. Helper: is the user currently an active founder?
CREATE OR REPLACE FUNCTION public.is_active_founder(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.founders_signups
    WHERE user_id = _user_id
      AND coupon_id = 'PRO-FOUNDERS-24M'
      AND revoked_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_founder(uuid) TO authenticated, service_role;

-- 5. Helper: sum of workers currently in use (running jobs)
CREATE OR REPLACE FUNCTION public.render_queue_running_workers()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(estimated_workers), 0)::int
  FROM public.render_queue
  WHERE status IN ('processing', 'rendering');
$$;

GRANT EXECUTE ON FUNCTION public.render_queue_running_workers() TO authenticated, service_role;

-- 6. System config defaults (feature flag + slot budget)
INSERT INTO public.system_config (key, value, description)
VALUES
  ('render_queue_enabled', 'true'::jsonb, 'Feature flag: dispatch renders through render_queue instead of direct invoke. Set to false for instant rollback to direct rendering.'),
  ('render_queue_slot_budget', '60'::jsonb, 'Total Lambda worker slots reserved for render dispatch (out of 100 account quota; 30 for edge functions, 10 burst reserve).')
ON CONFLICT (key) DO NOTHING;
