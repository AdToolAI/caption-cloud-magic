-- v431 G3.2.2-F1.IMP — Contract/Race/Merge tests for composer_finalize_lipsync_scene
-- Run inside a transaction that rolls back so production data is untouched.
-- These tests exercise the frozen matrix from docs/v431-g3-2-2-f1-contract.md.

BEGIN;

DO $$
DECLARE
  _project_id uuid := 'a1f12c21-50c3-4eb9-ba3b-943df13a7c37'::uuid;
  _user_id uuid := '8948d3d9-2c5e-4405-9e9c-1624448e7189'::uuid;
  _scene_id uuid := gen_random_uuid();
  _run_id uuid := gen_random_uuid();
  _job_id uuid := gen_random_uuid();
  _other_job_id uuid := gen_random_uuid();
  _result jsonb;
BEGIN
  -- Setup minimal scene under an existing project.
  -- The transaction rolls back, so no production data is mutated.

  INSERT INTO public.composer_scenes (
    id, project_id, order_index, scene_type, duration_seconds, clip_source,
    clip_status, text_overlay, transition_type, transition_duration,
    retry_count, cost_euros, clip_quality, dialog_turns, dialog_voices,
    dialog_mode, engine_override, pipeline_state, pipeline_state_at,
    plate_generation, active_run_id, lip_sync_status, twoshot_stage,
    dialog_shots, audio_plan
  ) VALUES (
    _scene_id, _project_id, 0, 'dialog', 10, 'ai',
    'rendering', '{}'::jsonb, 'cut', 0,
    0, 0, '720p', '[]'::jsonb, '{}'::jsonb,
    true, 'cinematic-sync', 'lipsync_muxing', now(),
    2, _run_id, 'pending', 'lipsync_muxing',
    jsonb_build_object(
      'status', 'lipsync_muxing',
      'source_clip_url', 'https://example.com/plate.mp4',
      'audio_mux', jsonb_build_object(
        'mux_dispatch_requested_at', '2026-08-15T22:00:00Z'
      )
    ),
    '{}'::jsonb
  );

  -- 1. Happy path: dispatched -> succeeded + complete
  INSERT INTO public.composer_pipeline_jobs (
    id, scene_id, run_id, run_contract_version, stage, attempt_no,
    idempotency_key, status, external_job_id, provider, metadata,
    plate_generation
  ) VALUES (
    _job_id, _scene_id, _run_id, 431, 'audio_mux', 1,
    'f1-test-1', 'dispatched', 'render-123', 'remotion',
    '{}'::jsonb, 2
  );

  _result := public.composer_finalize_lipsync_scene(
    _job_id, 'render-123', _scene_id,
    'https://example.com/final.mp4', 'stitch:done'
  );

  IF (_result->>'verdict') IS DISTINCT FROM 'finalized' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'happy path should finalize, got ' || (_result->>'verdict');
  END IF;

  -- Verify scene is complete
  IF (SELECT pipeline_state FROM public.composer_scenes WHERE id = _scene_id)
     IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'scene should be complete after happy path';
  END IF;

  -- Verify ledger job is succeeded
  IF (SELECT status FROM public.composer_pipeline_jobs WHERE id = _job_id)
     IS DISTINCT FROM 'succeeded' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'ledger job should be succeeded after happy path';
  END IF;

  -- Verify mux_dispatch_requested_at preserved
  IF (SELECT dialog_shots->'audio_mux'->>'mux_dispatch_requested_at'
      FROM public.composer_scenes WHERE id = _scene_id)
     IS DISTINCT FROM '2026-08-15T22:00:00Z' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'mux_dispatch_requested_at should be preserved';
  END IF;

  -- 2. Duplicate callback: succeeded -> already_completed
  _result := public.composer_finalize_lipsync_scene(
    _job_id, 'render-123', _scene_id,
    'https://example.com/final.mp4', 'stitch:done'
  );

  IF (_result->>'verdict') IS DISTINCT FROM 'already_completed' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'duplicate should be already_completed, got ' || (_result->>'verdict');
  END IF;

  -- 3. Invalid write_id
  _other_job_id := gen_random_uuid();
  INSERT INTO public.composer_pipeline_jobs (
    id, scene_id, run_id, run_contract_version, stage, attempt_no,
    idempotency_key, status, external_job_id, provider, metadata,
    plate_generation
  ) VALUES (
    _other_job_id, _scene_id, _run_id, 431, 'audio_mux', 1,
    'f1-test-2', 'dispatched', 'render-456', 'remotion',
    '{}'::jsonb, 2
  );

  _result := public.composer_finalize_lipsync_scene(
    _other_job_id, 'render-456', _scene_id,
    'https://example.com/final2.mp4', 'wrong:write'
  );

  IF (_result->>'verdict') IS DISTINCT FROM 'invalid_write_id' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'invalid write_id should be rejected, got ' || (_result->>'verdict');
  END IF;

  -- 4. Wrong external_job_id
  _result := public.composer_finalize_lipsync_scene(
    _other_job_id, 'render-999', _scene_id,
    'https://example.com/final2.mp4', 'stitch:done'
  );

  IF (_result->>'verdict') IS DISTINCT FROM 'wrong_job' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'wrong external_job_id should be wrong_job, got ' || (_result->>'verdict');
  END IF;

  -- 5. Scene_id confirmation guard mismatch
  _result := public.composer_finalize_lipsync_scene(
    _other_job_id, 'render-456', gen_random_uuid(),
    'https://example.com/final2.mp4', 'stitch:done'
  );

  IF (_result->>'verdict') IS DISTINCT FROM 'wrong_job' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'scene_id mismatch should be wrong_job, got ' || (_result->>'verdict');
  END IF;

  -- 6. dispatch_uncertain with matching external_job_id -> finalize
  UPDATE public.composer_pipeline_jobs
  SET status = 'dispatch_uncertain', external_job_id = 'render-789'
  WHERE id = _other_job_id;

  _result := public.composer_finalize_lipsync_scene(
    _other_job_id, 'render-789', _scene_id,
    'https://example.com/final3.mp4', 'stitch:done'
  );

  IF (_result->>'verdict') IS DISTINCT FROM 'finalized' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'dispatch_uncertain with matching external_job_id should finalize, got ' || (_result->>'verdict');
  END IF;

  -- 7. RS3 epoch-aware: pre-reset attempt rejected
  _other_job_id := gen_random_uuid();
  UPDATE public.composer_scenes
  SET audio_plan = jsonb_build_object(
    'twoshot', jsonb_build_object(
      'rs3_reset', jsonb_build_object(
        'run_id', _run_id::text,
        'plate_generation', 2,
        'reset_id', 'reset-epoch-1'
      )
    )
  ),
  pipeline_state = 'lipsync_muxing',
  lip_sync_status = 'pending'
  WHERE id = _scene_id;

  INSERT INTO public.composer_pipeline_jobs (
    id, scene_id, run_id, run_contract_version, stage, attempt_no,
    idempotency_key, status, external_job_id, provider, metadata,
    plate_generation
  ) VALUES (
    _other_job_id, _scene_id, _run_id, 431, 'audio_mux', 1,
    'f1-test-3', 'dispatched', 'render-rs3-old', 'remotion',
    jsonb_build_object('rs3_reset_id', 'reset-epoch-0'), 2
  );

  _result := public.composer_finalize_lipsync_scene(
    _other_job_id, 'render-rs3-old', _scene_id,
    'https://example.com/final-rs3.mp4', 'stitch:done'
  );

  IF (_result->>'verdict') IS DISTINCT FROM 'pre_reset_attempt' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'pre-reset attempt should be rejected, got ' || (_result->>'verdict');
  END IF;

  -- 8. RS3 epoch-aware: post-reset attempt with matching reset_id -> finalize
  UPDATE public.composer_pipeline_jobs
  SET metadata = jsonb_build_object('rs3_reset_id', 'reset-epoch-1')
  WHERE id = _other_job_id;

  _result := public.composer_finalize_lipsync_scene(
    _other_job_id, 'render-rs3-old', _scene_id,
    'https://example.com/final-rs3.mp4', 'stitch:done'
  );

  IF (_result->>'verdict') IS DISTINCT FROM 'finalized' THEN
    RAISE EXCEPTION 'TEST FAILED: %', 'post-reset attempt with matching reset_id should finalize, got ' || (_result->>'verdict');
  END IF;

  RAISE NOTICE 'ALL F1.IMP CONTRACT TESTS PASSED';
END;
$$;

ROLLBACK;
