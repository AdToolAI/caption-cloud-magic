-- FA-3/P1 — VERIFICATION-ONLY MIGRATION
-- No schema/data mutation persisted.
-- Contract: no CREATE/ALTER/DROP FUNCTION, no GRANT/REVOKE, no finalizer body change.
-- Fixtures + RPC calls + assertions only; each case in its own subtransaction,
-- rolled back via sentinel SQLSTATE 'FA3P1'. Only the sentinel is caught.

-- Case 1: Happy path — output materialization + base_video_url immutability
DO $$
DECLARE
  _project_id uuid := '939a7999-8874-49c2-b2ff-df805b16fd69'::uuid;
  _scene_id uuid := gen_random_uuid();
  _run_id uuid := gen_random_uuid();
  _job_id uuid := gen_random_uuid();
  _base_sentinel text := 'https://sentinel.invalid/fa3p1-base-DO-NOT-TOUCH.mp4';
  _final_url text := 'https://example.com/fa3p1-final.mp4';
  _result jsonb;
  _n int;
BEGIN
  BEGIN
    INSERT INTO public.composer_scenes (
      id, project_id, order_index, scene_type, duration_seconds, clip_source,
      clip_status, text_overlay, transition_type, transition_duration,
      retry_count, cost_euros, clip_quality, dialog_turns, dialog_voices,
      dialog_mode, engine_override, pipeline_state, pipeline_state_at,
      plate_generation, active_run_id, lip_sync_status, twoshot_stage,
      dialog_shots, audio_plan, base_video_url
    ) VALUES (
      _scene_id, _project_id, 999901, 'dialog', 10, 'ai',
      'rendering', '{}'::jsonb, 'cut', 0,
      0, 0, '720p', '[]'::jsonb, '{}'::jsonb,
      true, 'cinematic-sync', 'lipsync_muxing', now(),
      2, _run_id, 'pending', 'lipsync_muxing',
      jsonb_build_object(
        'status', 'lipsync_muxing',
        'source_clip_url', 'https://example.com/plate.mp4',
        'audio_mux', jsonb_build_object('mux_dispatch_requested_at', '2026-08-15T22:00:00Z')
      ),
      '{}'::jsonb, _base_sentinel
    );

    INSERT INTO public.composer_pipeline_jobs (
      id, scene_id, run_id, run_contract_version, stage, attempt_no,
      idempotency_key, status, external_job_id, provider, metadata, plate_generation
    ) VALUES (
      _job_id, _scene_id, _run_id, 431, 'audio_mux', 1,
      'fa3p1-verif-c1', 'dispatched', 'render-c1', 'remotion', '{}'::jsonb, 2
    );

    _result := public.composer_finalize_lipsync_scene(
      _job_id, 'render-c1', _scene_id, _final_url, 'stitch:done'
    );

    IF (_result->>'verdict') IS DISTINCT FROM 'finalized' THEN
      RAISE EXCEPTION 'C1 FAILED: verdict=% (expected finalized)', (_result->>'verdict');
    END IF;

    IF (SELECT pipeline_state FROM public.composer_scenes WHERE id = _scene_id)
       IS DISTINCT FROM 'complete' THEN
      RAISE EXCEPTION 'C1 FAILED: scene not complete';
    END IF;

    IF (SELECT processed_video_url FROM public.composer_scenes WHERE id = _scene_id)
       IS DISTINCT FROM _final_url THEN
      RAISE EXCEPTION 'C1 FAILED: processed_video_url not materialized';
    END IF;

    IF (SELECT clip_url FROM public.composer_scenes WHERE id = _scene_id)
       IS DISTINCT FROM _final_url THEN
      RAISE EXCEPTION 'C1 FAILED: clip_url not mirrored';
    END IF;

    IF (SELECT base_video_url FROM public.composer_scenes WHERE id = _scene_id)
       IS DISTINCT FROM _base_sentinel THEN
      RAISE EXCEPTION 'C1 FAILED: base_video_url was mutated';
    END IF;

    IF (SELECT status FROM public.composer_pipeline_jobs WHERE id = _job_id)
       IS DISTINCT FROM 'succeeded' THEN
      RAISE EXCEPTION 'C1 FAILED: ledger job not succeeded';
    END IF;

    IF (SELECT completed_at FROM public.composer_pipeline_jobs WHERE id = _job_id) IS NULL THEN
      RAISE EXCEPTION 'C1 FAILED: ledger job completed_at is NULL';
    END IF;

    IF (SELECT count(*) FROM public.composer_pipeline_jobs
        WHERE id = _job_id AND scene_id = _scene_id AND run_id = _run_id
          AND stage = 'audio_mux' AND plate_generation = 2) <> 1 THEN
      RAISE EXCEPTION 'C1 FAILED: ledger job identity drifted';
    END IF;

    SELECT count(*) INTO _n
    FROM public.composer_scene_transition_log
    WHERE scene_id = _scene_id AND write_id = 'stitch:done' AND applied = true;
    IF _n <> 1 THEN
      RAISE EXCEPTION 'C1 FAILED: expected 1 applied stitch:done transition, got %', _n;
    END IF;

    RAISE EXCEPTION USING ERRCODE = 'FA3P1', MESSAGE = 'C1 sentinel rollback';
  EXCEPTION WHEN SQLSTATE 'FA3P1' THEN NULL;
  END;
END;
$$;

-- Case 2: Duplicate / idempotency
DO $$
DECLARE
  _project_id uuid := '939a7999-8874-49c2-b2ff-df805b16fd69'::uuid;
  _scene_id uuid := gen_random_uuid();
  _run_id uuid := gen_random_uuid();
  _job_id uuid := gen_random_uuid();
  _base_sentinel text := 'https://sentinel.invalid/fa3p1-base-DO-NOT-TOUCH.mp4';
  _final_url text := 'https://example.com/fa3p1-final.mp4';
  _result jsonb;
  _completed_first timestamptz;
  _n int;
BEGIN
  BEGIN
    INSERT INTO public.composer_scenes (
      id, project_id, order_index, scene_type, duration_seconds, clip_source,
      clip_status, text_overlay, transition_type, transition_duration,
      retry_count, cost_euros, clip_quality, dialog_turns, dialog_voices,
      dialog_mode, engine_override, pipeline_state, pipeline_state_at,
      plate_generation, active_run_id, lip_sync_status, twoshot_stage,
      dialog_shots, audio_plan, base_video_url
    ) VALUES (
      _scene_id, _project_id, 999902, 'dialog', 10, 'ai',
      'rendering', '{}'::jsonb, 'cut', 0,
      0, 0, '720p', '[]'::jsonb, '{}'::jsonb,
      true, 'cinematic-sync', 'lipsync_muxing', now(),
      2, _run_id, 'pending', 'lipsync_muxing',
      jsonb_build_object(
        'status', 'lipsync_muxing',
        'source_clip_url', 'https://example.com/plate.mp4',
        'audio_mux', jsonb_build_object('mux_dispatch_requested_at', '2026-08-15T22:00:00Z')
      ),
      '{}'::jsonb, _base_sentinel
    );

    INSERT INTO public.composer_pipeline_jobs (
      id, scene_id, run_id, run_contract_version, stage, attempt_no,
      idempotency_key, status, external_job_id, provider, metadata, plate_generation
    ) VALUES (
      _job_id, _scene_id, _run_id, 431, 'audio_mux', 1,
      'fa3p1-verif-c2', 'dispatched', 'render-c2', 'remotion', '{}'::jsonb, 2
    );

    _result := public.composer_finalize_lipsync_scene(
      _job_id, 'render-c2', _scene_id, _final_url, 'stitch:done'
    );
    IF (_result->>'verdict') IS DISTINCT FROM 'finalized' THEN
      RAISE EXCEPTION 'C2 FAILED: first call verdict=%', (_result->>'verdict');
    END IF;

    SELECT completed_at INTO _completed_first
    FROM public.composer_pipeline_jobs WHERE id = _job_id;

    _result := public.composer_finalize_lipsync_scene(
      _job_id, 'render-c2', _scene_id, _final_url, 'stitch:done'
    );
    IF (_result->>'verdict') IS DISTINCT FROM 'already_completed' THEN
      RAISE EXCEPTION 'C2 FAILED: duplicate verdict=% (expected already_completed)', (_result->>'verdict');
    END IF;

    IF (SELECT processed_video_url FROM public.composer_scenes WHERE id = _scene_id)
       IS DISTINCT FROM _final_url
       OR (SELECT clip_url FROM public.composer_scenes WHERE id = _scene_id)
       IS DISTINCT FROM _final_url THEN
      RAISE EXCEPTION 'C2 FAILED: duplicate changed materialized output';
    END IF;

    IF (SELECT base_video_url FROM public.composer_scenes WHERE id = _scene_id)
       IS DISTINCT FROM _base_sentinel THEN
      RAISE EXCEPTION 'C2 FAILED: base_video_url was mutated';
    END IF;

    IF (SELECT completed_at FROM public.composer_pipeline_jobs WHERE id = _job_id)
       IS DISTINCT FROM _completed_first THEN
      RAISE EXCEPTION 'C2 FAILED: duplicate re-terminalized the ledger job';
    END IF;

    SELECT count(*) INTO _n
    FROM public.composer_scene_transition_log
    WHERE scene_id = _scene_id AND write_id = 'stitch:done' AND applied = true;
    IF _n <> 1 THEN
      RAISE EXCEPTION 'C2 FAILED: expected exactly 1 applied stitch:done transition, got %', _n;
    END IF;

    RAISE EXCEPTION USING ERRCODE = 'FA3P1', MESSAGE = 'C2 sentinel rollback';
  EXCEPTION WHEN SQLSTATE 'FA3P1' THEN NULL;
  END;
END;
$$;

-- Case 3: RS3 pre-reset fence — stale callback must not materialize output
DO $$
DECLARE
  _project_id uuid := '939a7999-8874-49c2-b2ff-df805b16fd69'::uuid;
  _scene_id uuid := gen_random_uuid();
  _run_id uuid := gen_random_uuid();
  _job_id uuid := gen_random_uuid();
  _base_sentinel text := 'https://sentinel.invalid/fa3p1-base-DO-NOT-TOUCH.mp4';
  _result jsonb;
BEGIN
  BEGIN
    INSERT INTO public.composer_scenes (
      id, project_id, order_index, scene_type, duration_seconds, clip_source,
      clip_status, text_overlay, transition_type, transition_duration,
      retry_count, cost_euros, clip_quality, dialog_turns, dialog_voices,
      dialog_mode, engine_override, pipeline_state, pipeline_state_at,
      plate_generation, active_run_id, lip_sync_status, twoshot_stage,
      dialog_shots, audio_plan, base_video_url
    ) VALUES (
      _scene_id, _project_id, 999903, 'dialog', 10, 'ai',
      'rendering', '{}'::jsonb, 'cut', 0,
      0, 0, '720p', '[]'::jsonb, '{}'::jsonb,
      true, 'cinematic-sync', 'lipsync_muxing', now(),
      2, _run_id, 'pending', 'lipsync_muxing',
      jsonb_build_object(
        'status', 'lipsync_muxing',
        'source_clip_url', 'https://example.com/plate.mp4',
        'audio_mux', jsonb_build_object('mux_dispatch_requested_at', '2026-08-15T22:00:00Z')
      ),
      jsonb_build_object(
        'twoshot', jsonb_build_object(
          'rs3_reset', jsonb_build_object(
            'run_id', _run_id::text,
            'plate_generation', 2,
            'reset_id', 'reset-epoch-1'
          )
        )
      ),
      _base_sentinel
    );

    INSERT INTO public.composer_pipeline_jobs (
      id, scene_id, run_id, run_contract_version, stage, attempt_no,
      idempotency_key, status, external_job_id, provider, metadata, plate_generation
    ) VALUES (
      _job_id, _scene_id, _run_id, 431, 'audio_mux', 1,
      'fa3p1-verif-c3', 'dispatched', 'render-rs3-stale', 'remotion',
      jsonb_build_object('rs3_reset_id', 'reset-epoch-0'), 2
    );

    _result := public.composer_finalize_lipsync_scene(
      _job_id, 'render-rs3-stale', _scene_id,
      'https://example.com/fa3p1-stale.mp4', 'stitch:done'
    );

    IF (_result->>'verdict') IS DISTINCT FROM 'pre_reset_attempt' THEN
      RAISE EXCEPTION 'C3 FAILED: verdict=% (expected pre_reset_attempt)', (_result->>'verdict');
    END IF;

    IF (SELECT processed_video_url FROM public.composer_scenes WHERE id = _scene_id) IS NOT NULL THEN
      RAISE EXCEPTION 'C3 FAILED: stale callback materialized processed_video_url';
    END IF;

    IF (SELECT clip_url FROM public.composer_scenes WHERE id = _scene_id) IS NOT NULL THEN
      RAISE EXCEPTION 'C3 FAILED: stale callback materialized clip_url';
    END IF;

    IF (SELECT base_video_url FROM public.composer_scenes WHERE id = _scene_id)
       IS DISTINCT FROM _base_sentinel THEN
      RAISE EXCEPTION 'C3 FAILED: base_video_url was mutated';
    END IF;

    IF (SELECT pipeline_state FROM public.composer_scenes WHERE id = _scene_id) = 'complete' THEN
      RAISE EXCEPTION 'C3 FAILED: stale callback completed the scene';
    END IF;

    RAISE EXCEPTION USING ERRCODE = 'FA3P1', MESSAGE = 'C3 sentinel rollback';
  EXCEPTION WHEN SQLSTATE 'FA3P1' THEN NULL;
  END;
END;
$$;