
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload_summary jsonb
);
GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND tablename='rate_limits'
       AND indexname='rate_limits_identifier_endpoint_key'
  ) THEN
    CREATE UNIQUE INDEX rate_limits_identifier_endpoint_key
      ON public.rate_limits(identifier, endpoint);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_identifier text,
  p_endpoint   text,
  p_max        integer,
  p_window_seconds integer
) RETURNS TABLE(allowed boolean, current_count integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.rate_limits%ROWTYPE;
  v_window_start timestamptz := now() - make_interval(secs => p_window_seconds);
BEGIN
  SELECT * INTO v_row
    FROM public.rate_limits
    WHERE identifier = p_identifier AND endpoint = p_endpoint
    FOR UPDATE;

  IF NOT FOUND OR v_row.window_start < v_window_start THEN
    INSERT INTO public.rate_limits (identifier, endpoint, request_count, window_start)
    VALUES (p_identifier, p_endpoint, 1, now())
    ON CONFLICT (identifier, endpoint) DO UPDATE
      SET request_count = 1, window_start = now(), updated_at = now();
    RETURN QUERY SELECT true, 1, now() + make_interval(secs => p_window_seconds);
    RETURN;
  END IF;

  IF v_row.request_count >= p_max THEN
    RETURN QUERY SELECT false, v_row.request_count,
      v_row.window_start + make_interval(secs => p_window_seconds);
    RETURN;
  END IF;

  UPDATE public.rate_limits
     SET request_count = request_count + 1, updated_at = now()
   WHERE id = v_row.id;

  RETURN QUERY SELECT true, v_row.request_count + 1,
    v_row.window_start + make_interval(secs => p_window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_rate_limit(text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text,text,integer,integer) TO service_role;
