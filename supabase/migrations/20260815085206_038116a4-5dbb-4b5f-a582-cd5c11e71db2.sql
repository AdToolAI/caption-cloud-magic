REVOKE ALL ON FUNCTION public.composer_reap_orphaned_dispatches(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_reap_orphaned_dispatches(integer) TO service_role;
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'sandbox_exec%' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.composer_reap_orphaned_dispatches(integer) TO %I', r);
  END LOOP;
END $$;
DELETE FROM public.composer_pipeline_jobs WHERE idempotency_key LIKE 'd4b:%' OR idempotency_key LIKE 'd4:%' OR idempotency_key LIKE 'd1:%' OR idempotency_key LIKE 'd2:%' OR idempotency_key LIKE 'd6:%' OR idempotency_key LIKE 'd7:%' OR idempotency_key LIKE 'd8:%' OR idempotency_key LIKE 'd9:%' OR idempotency_key LIKE 'd10:%' OR idempotency_key LIKE 'acquire:%sync_segment%' AND created_at > now() - interval '30 minutes' AND external_job_id IS NULL AND status IN ('dispatching','stale');