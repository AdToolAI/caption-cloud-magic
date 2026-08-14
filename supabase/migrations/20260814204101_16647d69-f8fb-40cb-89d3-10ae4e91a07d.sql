CREATE OR REPLACE FUNCTION public.composer_reset_lipsync_full(
  _scene_id uuid,
  _expected_generation integer,
  _expected_run_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cur composer_scenes%ROWTYPE;
  _base_url text;
  _processed_url text;
  _clip_url text;
  _new_audio_plan jsonb;
  _job_ids text[] := ARRAY[]::text[];
  _result jsonb;
  _key text;
  _keys_to_drop text[] := ARRAY[
    'faceMap',
    'anchor_face_audit',
    'sync_job_id',
    'segments_payload',
    'last_segments',
    'audio_input_mode',
    'passes',
    'syncJobs',
    'heartbeat',
    'lipsyncedAt',
    'diagnostics',
    'anchor_attempts',
    'postFixReset'
  ];
BEGIN
  -- Lock row and read current state atomically.
  SELECT * INTO _cur
  FROM public.composer_scenes
  WHERE id = _scene_id
  FOR UPDATE;

  IF _cur IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'scene_not_found');
  END IF;

  -- Stale-request guards.
  IF _cur.plate_generation IS DISTINCT FROM _expected_generation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_reset');
  END IF;

  IF _expected_run_id IS NOT NULL AND _cur.active_run_id IS DISTINCT FROM _expected_run_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_reset');
  END IF;

  IF _expected_run_id IS NULL AND _cur.active_run_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_reset');
  END IF;

  -- Resolve base plate with fail-closed rule.
  IF coalesce(_cur.base_video_url, '') <> '' THEN
    _base_url := _cur.base_video_url;
  ELSIF coalesce(_cur.lip_sync_source_clip_url, '') <> '' THEN
    _base_url := _cur.lip_sync_source_clip_url;
  ELSIF coalesce(_cur.processed_video_url, '') = '' AND coalesce(_cur.clip_url, '') = '' THEN
    -- Scene has no video at all; clear outputs.
    _base_url := NULL;
  ELSE
    -- Would have to use clip_url as base, but processed_video_url is set -> fail closed.
    RETURN jsonb_build_object('ok', false, 'reason', 'no_base_plate');
  END IF;

  _processed_url := NULL;
  _clip_url := _base_url;

  -- Build cleaned audio_plan.twoshot.
  _new_audio_plan := _cur.audio_plan;
  IF jsonb_typeof(_new_audio_plan) = 'object' THEN
    IF jsonb_typeof(_new_audio_plan -> 'twoshot') = 'object' THEN
      FOREACH _key IN ARRAY _keys_to_drop LOOP
        _new_audio_plan := _new_audio_plan #- ARRAY['twoshot', _key];
      END LOOP;
    END IF;
  END IF;

  -- Collect known job IDs to cancel after commit.
  IF _cur.dialog_shots IS NOT NULL AND jsonb_typeof(_cur.dialog_shots) = 'object' THEN
    -- v4 per-turn shots.
    IF jsonb_typeof(_cur.dialog_shots -> 'shots') = 'array' THEN
      FOR _key IN
        SELECT value ->> 'sync_job_id'
        FROM jsonb_array_elements(_cur.dialog_shots -> 'shots')
        WHERE value ? 'sync_job_id'
      LOOP
        IF coalesce(_key, '') <> '' THEN
          _job_ids := array_append(_job_ids, _key);
        END IF;
      END LOOP;
    END IF;

    -- v5 master passes.
    IF jsonb_typeof(_cur.dialog_shots -> 'passes') = 'array' THEN
      FOR _key IN
        SELECT value ->> 'job_id'
        FROM jsonb_array_elements(_cur.dialog_shots -> 'passes')
        WHERE value ? 'job_id'
      LOOP
        IF coalesce(_key, '') <> '' THEN
          _job_ids := array_append(_job_ids, _key);
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- v5 syncJobs in audio_plan.twoshot.
  IF jsonb_typeof(_cur.audio_plan) = 'object'
     AND jsonb_typeof(_cur.audio_plan -> 'twoshot') = 'object'
     AND jsonb_typeof(_cur.audio_plan -> 'twoshot' -> 'syncJobs') = 'object'
     AND jsonb_typeof(_cur.audio_plan -> 'twoshot' -> 'syncJobs' -> 'jobs') = 'array'
  THEN
    FOR _key IN
      SELECT
        CASE
          WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
          ELSE value ->> 'id'
        END
      FROM jsonb_array_elements(_cur.audio_plan -> 'twoshot' -> 'syncJobs' -> 'jobs')
    LOOP
      IF coalesce(_key, '') <> '' THEN
        _job_ids := array_append(_job_ids, _key);
      END IF;
    END LOOP;
  END IF;

  -- replicate_prediction_id if it looks like a sync job id.
  IF coalesce(_cur.replicate_prediction_id, '') <> ''
     AND _cur.replicate_prediction_id LIKE 'sync:%'
  THEN
    _job_ids := array_append(_job_ids, substring(_cur.replicate_prediction_id from 6));
  END IF;

  -- Deduplicate.
  SELECT array_agg(DISTINCT x) INTO _job_ids FROM unnest(_job_ids) AS x;

  -- Atomically bump generation and apply reset.
  UPDATE public.composer_scenes SET
    plate_generation = COALESCE(plate_generation, 1) + 1,
    base_video_url = _base_url,
    processed_video_url = _processed_url,
    clip_url = _clip_url,
    lip_sync_applied_at = NULL,
    lip_sync_status = 'canceled',
    twoshot_stage = NULL,
    dialog_mode = false,
    engine_override = 'auto',
    lip_sync_with_voiceover = false,
    replicate_prediction_id = NULL,
    dialog_shots = NULL,
    lip_sync_source_clip_url = NULL,
    clip_error = 'lipsync_reset_by_user',
    audio_plan = _new_audio_plan,
    updated_at = now()
  WHERE id = _scene_id;

  _result := jsonb_build_object(
    'ok', true,
    'scene_id', _scene_id,
    'new_generation', COALESCE(_cur.plate_generation, 1) + 1,
    'canceled_jobs', _job_ids,
    'base_restored', _base_url IS NOT NULL
  );

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.composer_reset_lipsync_full(uuid, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_reset_lipsync_full(uuid, integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.composer_reset_lipsync_full(uuid, integer, uuid) TO service_role;
