-- Video-Enhance orchestration tests (simulated claims, no provider traffic).
--
-- Everything happens inside one DO block that ends with RAISE EXCEPTION, so the
-- whole fixture is rolled back: no run, no ledger row and no wallet of a real
-- customer is touched. The collected report comes back as the exception text.
--
-- Covered:
--   1. global cap 3 + per-user cap 1 (3 users x 2 ready runs)
--   2. queued instead of failed: a 4th claim returns nothing
--   3. released lease frees a slot, fair order by created_at
--   4. monotonic terminal state: a late provider answer cannot revive a run
DO $$
DECLARE
  u uuid[];
  ids uuid[] := '{}';
  claimed uuid;
  report text := E'\n';
  n integer;
  v_status text;
BEGIN
  SELECT array_agg(id) INTO u FROM (SELECT id FROM auth.users ORDER BY created_at LIMIT 3) s;
  IF array_length(u, 1) < 3 THEN RAISE EXCEPTION 'need 3 users'; END IF;

  FOR i IN 1..6 LOOP
    INSERT INTO public.video_enhance_runs (
      user_id, idempotency_key, model_id, mode, resolution, fps, tier,
      source_url, source_duration_seconds, source_width, source_height, source_fps,
      pricing_version, provider_pricing_version, rate_card_version,
      provider_cost_usd_estimated, provider_cost_eur_buffered, fx_rate_used,
      fx_safety_buffer_used, user_price_eur, callback_token,
      status, provider_output_url, created_at
    ) VALUES (
      u[((i - 1) / 2) + 1], 'test-claim-' || i, 'topaz-proteus', 'upscale', '4k', 60, 'pro',
      'https://example.invalid/src.mp4', 10, 1080, 1920, 30,
      'test', 'test', 'test', 1, 1, 1, 1, 1, 'tok-' || i,
      'provider_output_ready', 'https://example.invalid/out.mp4', now() + (i || ' seconds')::interval
    ) RETURNING id INTO claimed;
    ids := ids || claimed;
  END LOOP;

  -- 1 + 2: four claim attempts, only three may win, one per user.
  n := 0;
  FOR i IN 1..4 LOOP
    SELECT r.id INTO claimed
      FROM public.video_enhance_claim_persist_run('w' || i, 240, 3, 1) r;
    IF claimed IS NOT NULL THEN n := n + 1; END IF;
    claimed := NULL;
  END LOOP;
  report := report || format('claims won of 4 attempts: %s (expect 3)%s', n, E'\n');

  SELECT count(*) INTO n FROM public.video_enhance_runs
   WHERE id = ANY(ids) AND persist_lease_until > now();
  report := report || format('active leases: %s (expect 3)%s', n, E'\n');

  SELECT count(DISTINCT user_id) INTO n FROM public.video_enhance_runs
   WHERE id = ANY(ids) AND persist_lease_until > now();
  report := report || format('distinct users holding a lease: %s (expect 3, per-user cap 1)%s', n, E'\n');

  -- 3: releasing one lease frees exactly one slot again.
  UPDATE public.video_enhance_runs SET persist_lease_until = NULL
   WHERE id = (SELECT id FROM public.video_enhance_runs
                WHERE id = ANY(ids) AND persist_lease_until > now()
                ORDER BY created_at LIMIT 1);
  SELECT r.id INTO claimed FROM public.video_enhance_claim_persist_run('w9', 240, 3, 1) r;
  report := report || format('claim after release: %s (expect a run id)%s',
    coalesce(claimed::text, 'NONE'), E'\n');

  -- 4: a late provider answer must not revive a finished run.
  UPDATE public.video_enhance_runs SET status = 'completed' WHERE id = ids[1];
  UPDATE public.video_enhance_runs SET status = 'provider_processing' WHERE id = ids[1];
  SELECT status INTO v_status FROM public.video_enhance_runs WHERE id = ids[1];
  report := report || format('status after late provider answer: %s (expect completed)%s', v_status, E'\n');

  RAISE EXCEPTION 'VIDEO_ENHANCE_TEST_REPORT%', report;
END $$;
