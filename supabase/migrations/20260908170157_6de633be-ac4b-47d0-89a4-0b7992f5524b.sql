CREATE OR REPLACE FUNCTION public.video_enhance_claim_persist_run(
  p_worker text,
  p_lease_seconds integer DEFAULT 240,
  p_max_global integer DEFAULT 3,
  p_max_per_user integer DEFAULT 1
)
RETURNS SETOF public.video_enhance_runs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active integer;
BEGIN
  -- Active heavy transfers right now = rows holding a live lease.
  SELECT count(*) INTO v_active
    FROM public.video_enhance_runs
   WHERE persist_lease_until IS NOT NULL
     AND persist_lease_until > now();

  IF p_max_global IS NOT NULL AND v_active >= p_max_global THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.video_enhance_runs r
     SET persist_lease_owner = p_worker,
         persist_lease_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   WHERE r.id = (
     SELECT c.id
       FROM public.video_enhance_runs c
      WHERE c.status IN ('provider_output_ready','asset_staging','asset_persisting','asset_persist_failed')
        AND c.provider_output_url IS NOT NULL
        AND (c.next_persist_at IS NULL OR c.next_persist_at <= now())
        AND (c.persist_lease_until IS NULL OR c.persist_lease_until < now())
        -- Fairness: a user already moving a file does not take a second slot.
        AND (
          p_max_per_user IS NULL
          OR (
            SELECT count(*)
              FROM public.video_enhance_runs u
             WHERE u.user_id = c.user_id
               AND u.persist_lease_until IS NOT NULL
               AND u.persist_lease_until > now()
          ) < p_max_per_user
        )
      ORDER BY c.created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION public.video_enhance_claim_persist_run(text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.video_enhance_claim_persist_run(text, integer, integer, integer) TO service_role;