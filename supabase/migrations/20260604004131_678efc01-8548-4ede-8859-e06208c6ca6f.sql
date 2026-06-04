CREATE OR REPLACE FUNCTION public.syncso_recent_failure_count(_window_min integer DEFAULT 5)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
  FROM public.syncso_dispatch_log
  WHERE created_at > now() - make_interval(mins => _window_min)
    AND error_class IN ('timeout', 'rate_limited', 'http_5xx', 'auth')
    AND sync_status IN ('FAILED', 'REJECTED', 'CANCELED', 'DISPATCH_FAILED');
$function$;

UPDATE public.provider_circuit_state
SET state = 'closed',
    fail_count = 0,
    opened_at = NULL,
    half_open_at = NULL,
    last_error_class = NULL,
    updated_at = now()
WHERE provider = 'sync.so';

UPDATE public.wallets w
SET balance = balance + 243,
    updated_at = now()
FROM public.composer_scenes s
JOIN public.composer_projects p ON p.id = s.project_id
WHERE s.id = '9e72cae4-1f0e-45a3-abd7-c9201a95b9d5'
  AND w.user_id = p.user_id
  AND COALESCE((s.dialog_shots->>'refunded')::boolean, false) = false;

UPDATE public.composer_scenes
SET lip_sync_status = 'failed',
    twoshot_stage = 'failed',
    clip_error = 'syncso_provider_unknown_no_code_after_retries: Sync.so hat den 3-Sprecher-Plate (Matthew/Kailee) ohne error_code abgewiesen. Bitte „Lip-Sync neu rendern" klicken.',
    dialog_shots = jsonb_set(
      jsonb_set(
        jsonb_set(COALESCE(dialog_shots, '{}'::jsonb), '{status}', '"failed"'),
        '{refunded}', 'true'
      ),
      '{error}', '"syncso_provider_unknown_no_code_after_retries"'
    ),
    updated_at = now()
WHERE id = '9e72cae4-1f0e-45a3-abd7-c9201a95b9d5';

DELETE FROM public.syncso_inflight_jobs
WHERE scene_id IN (
  '9e72cae4-1f0e-45a3-abd7-c9201a95b9d5',
  '4a56d6a1-2f0b-4ef1-8bef-20fa0477ff68'
);