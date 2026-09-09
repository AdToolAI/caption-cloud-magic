CREATE TABLE public.included_allowances (
  user_id UUID NOT NULL PRIMARY KEY,
  period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now()),
  period_end TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  fast_video_limit INTEGER NOT NULL DEFAULT 10,
  fast_video_used INTEGER NOT NULL DEFAULT 0,
  music_limit INTEGER NOT NULL DEFAULT 50,
  music_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.included_allowances TO authenticated;
GRANT ALL ON public.included_allowances TO service_role;
ALTER TABLE public.included_allowances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own included allowance"
  ON public.included_allowances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.included_allowance_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fast_video','music')),
  job_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','released')),
  period_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, job_key)
);

GRANT SELECT ON public.included_allowance_claims TO authenticated;
GRANT ALL ON public.included_allowance_claims TO service_role;
ALTER TABLE public.included_allowance_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own included allowance claims"
  ON public.included_allowance_claims FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_included_allowances_updated_at
  BEFORE UPDATE ON public.included_allowances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_included_allowance_claims_updated_at
  BEFORE UPDATE ON public.included_allowance_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_included_allowance(
  _user_id UUID,
  _kind TEXT,
  _job_key TEXT,
  _period_start TIMESTAMPTZ,
  _period_end TIMESTAMPTZ,
  _limit INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.included_allowances;
  v_used INTEGER;
  v_existing public.included_allowance_claims;
BEGIN
  IF _kind NOT IN ('fast_video','music') THEN
    RAISE EXCEPTION 'invalid allowance kind %', _kind;
  END IF;

  INSERT INTO public.included_allowances (user_id, period_start, period_end)
  VALUES (_user_id, _period_start, _period_end)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.included_allowances
   WHERE user_id = _user_id FOR UPDATE;

  -- New billing period: reset counters, no rollover.
  IF v_row.period_start IS DISTINCT FROM _period_start THEN
    UPDATE public.included_allowances
       SET period_start = _period_start,
           period_end = _period_end,
           fast_video_used = 0,
           music_used = 0
     WHERE user_id = _user_id
     RETURNING * INTO v_row;
  END IF;

  -- Idempotency: the same job never consumes the allowance twice.
  SELECT * INTO v_existing FROM public.included_allowance_claims
   WHERE user_id = _user_id AND kind = _kind AND job_key = _job_key;

  IF FOUND AND v_existing.status = 'claimed' THEN
    v_used := CASE WHEN _kind = 'fast_video' THEN v_row.fast_video_used ELSE v_row.music_used END;
    RETURN jsonb_build_object('claimed', true, 'duplicate', true, 'used', v_used, 'limit', _limit,
                              'period_start', v_row.period_start, 'period_end', v_row.period_end);
  END IF;

  v_used := CASE WHEN _kind = 'fast_video' THEN v_row.fast_video_used ELSE v_row.music_used END;

  IF v_used >= _limit THEN
    RETURN jsonb_build_object('claimed', false, 'duplicate', false, 'used', v_used, 'limit', _limit,
                              'period_start', v_row.period_start, 'period_end', v_row.period_end);
  END IF;

  IF _kind = 'fast_video' THEN
    UPDATE public.included_allowances
       SET fast_video_used = fast_video_used + 1, fast_video_limit = _limit
     WHERE user_id = _user_id RETURNING fast_video_used INTO v_used;
  ELSE
    UPDATE public.included_allowances
       SET music_used = music_used + 1, music_limit = _limit
     WHERE user_id = _user_id RETURNING music_used INTO v_used;
  END IF;

  INSERT INTO public.included_allowance_claims (user_id, kind, job_key, status, period_start)
  VALUES (_user_id, _kind, _job_key, 'claimed', _period_start)
  ON CONFLICT (user_id, kind, job_key)
  DO UPDATE SET status = 'claimed', period_start = _period_start;

  RETURN jsonb_build_object('claimed', true, 'duplicate', false, 'used', v_used, 'limit', _limit,
                            'period_start', _period_start, 'period_end', _period_end);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_included_allowance(
  _user_id UUID,
  _kind TEXT,
  _job_key TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.included_allowance_claims;
  v_row public.included_allowances;
BEGIN
  SELECT * INTO v_claim FROM public.included_allowance_claims
   WHERE user_id = _user_id AND kind = _kind AND job_key = _job_key
   FOR UPDATE;

  IF NOT FOUND OR v_claim.status <> 'claimed' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row FROM public.included_allowances
   WHERE user_id = _user_id FOR UPDATE;

  -- Only give the allowance back inside the period it was taken from.
  IF FOUND AND v_row.period_start = v_claim.period_start THEN
    IF _kind = 'fast_video' THEN
      UPDATE public.included_allowances
         SET fast_video_used = GREATEST(0, fast_video_used - 1)
       WHERE user_id = _user_id;
    ELSE
      UPDATE public.included_allowances
         SET music_used = GREATEST(0, music_used - 1)
       WHERE user_id = _user_id;
    END IF;
  END IF;

  UPDATE public.included_allowance_claims
     SET status = 'released'
   WHERE id = v_claim.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_included_allowance(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_included_allowance(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_included_allowance(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_included_allowance(UUID, TEXT, TEXT) TO service_role;