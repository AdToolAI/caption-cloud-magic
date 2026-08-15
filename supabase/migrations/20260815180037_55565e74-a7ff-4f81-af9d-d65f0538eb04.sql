-- v431 G3.2.2 — Sync Segment Authoritative Apply
-- Contract: docs/v431-g3-2-2-contract.md (LOCKED)

-- §5a Schritt 2 — Allowlist-Erweiterung. Das Retry-Primitive bleibt unveraendert.
CREATE OR REPLACE FUNCTION public.composer_retryable_failure_reasons()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT ARRAY[
    'provider_transient_error',
    'provider_timeout',
    'provider_rate_limited',
    'dispatch_uncertain_recovery',
    'watchdog_stalled',
    'poller_timeout',
    'mux_redispatch',
    'sync_noop_retryable'
  ]::text[];
$function$;

-- Interner Refund-Marker (Edge fuehrt die Wallet-Gutschrift aus, danach genau
-- ein schmaler, idempotenter Key-Write auf dialog_shots.refunded).
CREATE OR REPLACE FUNCTION public.composer_mark_sync_refund_applied(
  _scene_id uuid,
  _amount numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _ds jsonb;
BEGIN
  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF COALESCE((_ds->>'refunded')::boolean, false) THEN RETURN false; END IF;

  UPDATE public.composer_scenes
  SET dialog_shots = jsonb_set(
        jsonb_set(_ds, ARRAY['refunded'], 'true'::jsonb, true),
        ARRAY['refunded_amount'], to_jsonb(COALESCE(_amount, 0)), true),
      updated_at = now()
  WHERE id = _scene_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_mark_sync_refund_applied(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_mark_sync_refund_applied(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.composer_mark_sync_refund_applied(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_mark_sync_refund_applied(uuid, numeric) TO service_role;

-- §4 — Sole owner des Sync-Segment-Apply.
CREATE OR REPLACE FUNCTION public.composer_apply_sync_segment_result(
  _pipeline_job_id uuid,
  _external_job_id text,
  _write_id text,
  _provider_status text,
  _output_url text,
  _error_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _repl public.composer_pipeline_jobs%ROWTYPE;
  _scene public.composer_scenes%ROWTYPE;
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _pass_idx integer;
  _patch jsonb;
  _segment_result text;
  _scene_verdict text;
  _replacement_id uuid;
  _new_attempt integer;
  _total integer;
  _len integer;
  _done integer;
  _failed integer;
  _all_terminal boolean;
  _partial_allowed boolean;
  _final_url text;
  _mux_exists boolean;
  _next_pending integer;
  _cost numeric := 0;
  _already_refunded boolean := false;
  _err text;
  _i integer;
  _p jsonb;
BEGIN
  _err := left(COALESCE(NULLIF(btrim(_error_text), ''), ''), 500);

  -- ── Geschlossene write_id/provider_status/output-Matrix ─────────────────
  IF _write_id = 'ssw:success' THEN
    IF _provider_status IS DISTINCT FROM 'COMPLETED'
       OR COALESCE(btrim(_output_url), '') = '' THEN
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_mismatch');
    END IF;
  ELSIF _write_id = 'ssw:failed' THEN
    IF _provider_status IS NULL
       OR _provider_status NOT IN ('FAILED', 'REJECTED', 'CANCELED')
       OR _output_url IS NOT NULL THEN
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_mismatch');
    END IF;
  ELSIF _write_id IN ('ssw:noop_fail', 'ssw:noop_escalate') THEN
    IF _provider_status IS DISTINCT FROM 'COMPLETED' OR _output_url IS NOT NULL THEN
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_mismatch');
    END IF;
  ELSE
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'write_id_not_allowed');
  END IF;

  -- ── Provenienz: Ledger-Zeile ist Autoritaet (D1-Lockreihenfolge) ────────
  IF _pipeline_job_id IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'missing_binding');
  END IF;

  SELECT * INTO _job FROM public.composer_pipeline_jobs
  WHERE id = _pipeline_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'job_not_found');
  END IF;
  IF _job.stage IS DISTINCT FROM 'sync_segment' THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'wrong_stage');
  END IF;

  SELECT * INTO _scene FROM public.composer_scenes WHERE id = _job.scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'scene_not_found');
  END IF;

  IF _job.external_job_id IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'binding_pending');
  END IF;
  IF _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'wrong_job');
  END IF;
  IF _job.run_id IS DISTINCT FROM _scene.active_run_id THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'stale_run');
  END IF;
  IF _job.plate_generation IS DISTINCT FROM _scene.plate_generation THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'stale_generation');
  END IF;

  IF _job.metadata IS NULL OR (_job.metadata->>'pass_idx') IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'pass_identity_missing');
  END IF;
  _pass_idx := (_job.metadata->>'pass_idx')::integer;

  _ds := COALESCE(_scene.dialog_shots, '{}'::jsonb);
  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array' THEN _ds->'passes' ELSE '[]'::jsonb END;
  _len := jsonb_array_length(_arr);
  IF _len <= _pass_idx THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected', 'reason', 'wrong_pass');
  END IF;
  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  _total := GREATEST(COALESCE(NULLIF(_ds->>'total_passes', '')::integer, _len), 1);
  _cost := COALESCE(NULLIF(_ds->>'cost_credits', '')::numeric, 0);
  _already_refunded := COALESCE((_ds->>'refunded')::boolean, false);

  -- ── §8 Duplicate-Matrix (vor jeder Mutation) ───────────────────────────
  IF _job.status = 'succeeded' THEN
    IF _write_id <> 'ssw:success'
       OR (_slot->>'output_url') IS DISTINCT FROM _output_url THEN
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected',
        'reason', 'conflicting_duplicate', 'pass_idx', _pass_idx);
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.composer_pipeline_jobs
      WHERE scene_id = _job.scene_id AND run_id = _job.run_id
        AND stage = 'audio_mux'
        AND plate_generation IS NOT DISTINCT FROM _job.plate_generation
    ) INTO _mux_exists;

    _done := 0; _failed := 0;
    FOR _i IN 0.._len - 1 LOOP
      _p := _arr->_i;
      IF (_p->>'status') = 'done' THEN _done := _done + 1;
      ELSIF (_p->>'status') IN ('failed', 'canceled_by_scene_failure') THEN _failed := _failed + 1;
      END IF;
    END LOOP;
    _all_terminal := (_done + _failed) >= _len;
    _partial_allowed := _total <= 2;

    IF NOT _mux_exists AND _all_terminal AND _done > 0
       AND (_failed = 0 OR _partial_allowed) THEN
      _final_url := NULL;
      FOR _i IN REVERSE _len - 1..0 LOOP
        _p := _arr->_i;
        IF (_p->>'status') = 'done' AND COALESCE(_p->>'output_url', '') <> '' THEN
          _final_url := _p->>'output_url'; EXIT;
        END IF;
      END LOOP;
      _ds := jsonb_set(_ds, ARRAY['audio_mux', 'mux_dispatch_requested_at'],
                       to_jsonb(now()::text), true);
      UPDATE public.composer_scenes SET dialog_shots = _ds, updated_at = now()
      WHERE id = _scene.id;
      RETURN jsonb_build_object('applied', false, 'verdict', 'dispatch_mux',
        'segment_result', 'succeeded', 'scene_verdict', 'dispatch_mux',
        'pass_idx', _pass_idx, 'reason', 'duplicate_redrive',
        'final_url', _final_url, 'total_passes', _total, 'done_count', _done);
    END IF;

    RETURN jsonb_build_object('applied', false, 'verdict', 'noop',
      'segment_result', 'succeeded', 'pass_idx', _pass_idx, 'reason', 'duplicate_callback');
  END IF;

  IF _job.status IN ('failed', 'stale', 'cancelled') OR _job.replaced_by IS NOT NULL THEN
    IF _job.error_code = 'sync_noop_retryable' AND _job.replaced_by IS NOT NULL THEN
      SELECT * INTO _repl FROM public.composer_pipeline_jobs WHERE id = _job.replaced_by;
      IF FOUND AND _repl.external_job_id IS NULL
         AND _repl.status IN ('pending', 'dispatching') THEN
        RETURN jsonb_build_object('applied', false, 'verdict', 'redispatch',
          'segment_result', 'failed', 'scene_verdict', 'redispatch',
          'pass_idx', _pass_idx, 'replacement_job_id', _repl.id,
          'reason', 'duplicate_redrive');
      END IF;
      RETURN jsonb_build_object('applied', false, 'verdict', 'noop',
        'segment_result', 'failed', 'pass_idx', _pass_idx, 'reason', 'duplicate_callback');
    END IF;
    IF _write_id = 'ssw:success' THEN
      RETURN jsonb_build_object('applied', false, 'verdict', 'rejected',
        'reason', 'conflicting_duplicate', 'pass_idx', _pass_idx);
    END IF;
    RETURN jsonb_build_object('applied', false, 'verdict', 'noop',
      'segment_result', 'failed', 'pass_idx', _pass_idx, 'reason', 'attempt_superseded');
  END IF;

  -- ── Pointer-Bestaetigung (Identitaet kam aus dem Ledger) ────────────────
  IF (_slot->>'pipeline_job_id') IS DISTINCT FROM _pipeline_job_id::text
     OR (_slot->>'job_id') IS DISTINCT FROM _external_job_id THEN
    RETURN jsonb_build_object('applied', false, 'verdict', 'rejected',
      'reason', 'wrong_pass', 'pass_idx', _pass_idx);
  END IF;

  -- ── Deterministischer Slot-Patch ────────────────────────────────────────
  IF _write_id = 'ssw:success' THEN
    _patch := jsonb_build_object(
      'status', 'done',
      'output_url', _output_url,
      'finished_at', now()
    );
    _segment_result := 'succeeded';
  ELSIF _write_id = 'ssw:failed' THEN
    _patch := jsonb_build_object(
      'status', 'failed',
      'finished_at', now(),
      'last_error', left(_err, 300),
      'last_error_class', 'provider_' || lower(_provider_status)
    );
    _segment_result := 'failed';
  ELSIF _write_id = 'ssw:noop_fail' THEN
    _patch := jsonb_build_object(
      'status', 'failed',
      'finished_at', now(),
      'error', 'sync_noop_unrecoverable',
      'last_error', 'sync_noop_unrecoverable',
      'last_error_class', 'sync_noop_unrecoverable',
      'noop_reason', left(_err, 300)
    );
    _segment_result := 'failed';
  ELSE -- ssw:noop_escalate
    _patch := jsonb_build_object(
      'status', 'pending',
      'job_id', NULL,
      'pipeline_job_id', NULL,
      'output_url', NULL,
      'finished_at', NULL,
      'noop_escalation_step', COALESCE(NULLIF(_slot->>'noop_escalation_step', '')::integer, 0) + 1,
      'noop_retry_attempted', true,
      'noop_retry_reason', left(_err, 300)
    );
    _segment_result := 'failed';
  END IF;

  _ds := public.update_dialog_pass_slot(_scene.id, _pass_idx, _patch);
  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array' THEN _ds->'passes' ELSE '[]'::jsonb END;
  _len := jsonb_array_length(_arr);

  -- ── Ledger-Terminalisierung des Segments ────────────────────────────────
  UPDATE public.composer_pipeline_jobs
  SET status = CASE WHEN _write_id = 'ssw:success' THEN 'succeeded' ELSE 'failed' END,
      error_code = CASE
        WHEN _write_id = 'ssw:success' THEN NULL
        WHEN _write_id = 'ssw:noop_fail' THEN 'sync_noop_unrecoverable'
        WHEN _write_id = 'ssw:noop_escalate' THEN 'sync_noop_retryable'
        ELSE 'provider_' || lower(_provider_status)
      END,
      completed_at = now(),
      callback_delivery_status = 'succeeded',
      updated_at = now()
  WHERE id = _job.id;

  -- ── NOOP-Escalate: Replacement im selben Commit ─────────────────────────
  IF _write_id = 'ssw:noop_escalate' THEN
    SELECT r.job_id, r.attempt_no INTO _replacement_id, _new_attempt
    FROM public.composer_replace_pipeline_attempt(
      _job.id, _job.scene_id, _job.run_id, 'sync_segment', _job.plate_generation,
      _job.provider,
      jsonb_build_object(
        'dispatcher', 'sync-so-webhook',
        'pass_idx', _pass_idx,
        'total_passes', _total,
        'retry_reason', 'sync_noop_retryable',
        'retry_of_job_id', _job.id::text
      )
    ) AS r;

    UPDATE public.composer_scenes
    SET lip_sync_status = 'running',
        twoshot_stage = 'syncso_noop_escalation',
        updated_at = now()
    WHERE id = _scene.id;

    RETURN jsonb_build_object(
      'applied', true, 'verdict', 'redispatch',
      'segment_result', 'failed', 'scene_verdict', 'redispatch',
      'pass_idx', _pass_idx, 'replacement_job_id', _replacement_id,
      'attempt_no', _new_attempt, 'total_passes', _total
    );
  END IF;

  -- ── Aggregat (§3/§3a) ───────────────────────────────────────────────────
  _done := 0; _failed := 0; _next_pending := NULL; _final_url := NULL;
  FOR _i IN 0.._len - 1 LOOP
    _p := _arr->_i;
    IF (_p->>'status') = 'done' THEN
      _done := _done + 1;
      IF COALESCE(_p->>'output_url', '') <> '' THEN _final_url := _p->>'output_url'; END IF;
    ELSIF (_p->>'status') IN ('failed', 'canceled_by_scene_failure') THEN
      _failed := _failed + 1;
    ELSIF _next_pending IS NULL
      AND ((_p->>'status') = 'pending' OR COALESCE(_p->>'job_id', '') = '') THEN
      _next_pending := _i;
    END IF;
  END LOOP;
  _all_terminal := (_done + _failed) >= _len;
  _partial_allowed := _total <= 2;

  IF _all_terminal AND _done > 0 AND (_failed = 0 OR _partial_allowed) THEN
    _scene_verdict := 'dispatch_mux';
  ELSIF _all_terminal AND _failed > 0 THEN
    _scene_verdict := 'fail';
  ELSE
    _scene_verdict := 'continue';
  END IF;

  IF _scene_verdict = 'dispatch_mux' THEN
    _ds := jsonb_set(_ds, ARRAY['status'], '"audio_muxing"'::jsonb, true);
    _ds := jsonb_set(_ds, ARRAY['final_url'], to_jsonb(_final_url), true);
    _ds := jsonb_set(_ds, ARRAY['finished_at'], to_jsonb(now()::text), true);
    IF _failed > 0 THEN
      _ds := jsonb_set(_ds, ARRAY['partial_mux'], 'true'::jsonb, true);
    END IF;
    _ds := jsonb_set(_ds, ARRAY['audio_mux', 'mux_dispatch_requested_at'],
                     to_jsonb(now()::text), true);
    IF COALESCE(_ds->'audio_mux'->>'dispatched_at', '') = '' THEN
      _ds := jsonb_set(_ds, ARRAY['audio_mux', 'dispatched_at'], to_jsonb(now()::text), true);
    END IF;

    UPDATE public.composer_scenes
    SET dialog_shots = _ds,
        lip_sync_status = 'audio_muxing',
        twoshot_stage = 'audio_muxing',
        clip_error = NULL,
        updated_at = now()
    WHERE id = _scene.id;

  ELSIF _scene_verdict = 'fail' THEN
    -- Alive-Siblings terminalisieren (kein Whole-JSON-Replace fremder Inhalte).
    FOR _i IN 0.._len - 1 LOOP
      _p := _arr->_i;
      IF _i <> _pass_idx AND (_p->>'status') IN ('rendering', 'retrying', 'pending') THEN
        _arr := jsonb_set(_arr, ARRAY[_i::text],
          _p || jsonb_build_object('status', 'canceled_by_scene_failure',
                                   'finished_at', now()), true);
      END IF;
    END LOOP;
    _ds := jsonb_set(_ds, ARRAY['passes'], _arr, true);
    _ds := jsonb_set(_ds, ARRAY['status'], '"failed"'::jsonb, true);
    _ds := jsonb_set(_ds, ARRAY['finished_at'], to_jsonb(now()::text), true);
    _ds := jsonb_set(_ds, ARRAY['error'], to_jsonb(_err), true);
    _ds := jsonb_set(_ds, ARRAY['scene_failure_source'], '"sync-so-webhook"'::jsonb, true);
    _ds := jsonb_set(_ds, ARRAY['watchdog_finalized'], 'false'::jsonb, true);
    _ds := jsonb_set(_ds, ARRAY['partial_done_count'], to_jsonb(_done), true);

    UPDATE public.composer_scenes
    SET dialog_shots = _ds,
        lip_sync_status = 'failed',
        twoshot_stage = CASE WHEN _write_id = 'ssw:noop_fail'
                             THEN 'needs_clip_rerender' ELSE 'failed' END,
        clip_error = _err,
        updated_at = now()
    WHERE id = _scene.id;

  ELSE
    UPDATE public.composer_scenes
    SET dialog_shots = _ds,
        lip_sync_status = 'running',
        twoshot_stage = 'syncso_fanout_' || _done || '_of_' || _total,
        updated_at = now()
    WHERE id = _scene.id;
  END IF;

  RETURN jsonb_build_object(
    'applied', true,
    'verdict', _scene_verdict,
    'segment_result', _segment_result,
    'scene_verdict', _scene_verdict,
    'pass_idx', _pass_idx,
    'scene_id', _scene.id,
    'run_id', _job.run_id,
    'plate_generation', _job.plate_generation,
    'total_passes', _total,
    'done_count', _done,
    'failed_count', _failed,
    'final_url', _final_url,
    'next_pending_pass_idx', _next_pending,
    'refund_due', CASE WHEN _scene_verdict = 'fail' AND NOT _already_refunded
                       THEN _cost ELSE 0 END,
    'already_refunded', _already_refunded
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) TO service_role;