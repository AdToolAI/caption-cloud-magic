ALTER TABLE public.composer_scenes ADD COLUMN IF NOT EXISTS plate_pipeline_job_id uuid;

-- ── Paar-Invariante für (replicate_prediction_id, plate_pipeline_job_id) ──
CREATE OR REPLACE FUNCTION public.composer_scenes_plate_pointer_pair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.replicate_prediction_id IS DISTINCT FROM OLD.replicate_prediction_id THEN
    IF NEW.replicate_prediction_id IS NULL THEN
      NEW.plate_pipeline_job_id := NULL;
    ELSIF NEW.plate_pipeline_job_id IS NOT DISTINCT FROM OLD.plate_pipeline_job_id THEN
      NEW.plate_pipeline_job_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS composer_scenes_plate_pointer_pair_trg ON public.composer_scenes;
CREATE TRIGGER composer_scenes_plate_pointer_pair_trg
BEFORE UPDATE ON public.composer_scenes
FOR EACH ROW EXECUTE FUNCTION public.composer_scenes_plate_pointer_pair();

-- ── Slot-Schreibschicht: pipeline_job_id wie job_id behandeln ─────────────
CREATE OR REPLACE FUNCTION public.update_dialog_pass_slot(_scene_id uuid, _pass_idx integer, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _new_status text;
  _old_status text;
  _new_shots jsonb;
  _has_job boolean;
  _has_ptr boolean;
BEGIN
  IF _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'update_dialog_pass_slot: patch must be a jsonb object';
  END IF;

  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;

  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array'
               THEN _ds->'passes' ELSE '[]'::jsonb END;
  WHILE jsonb_array_length(_arr) <= _pass_idx LOOP
    _arr := _arr || jsonb_build_array(jsonb_build_object(
      'idx', jsonb_array_length(_arr), 'status', 'pending', 'slot_padded', true
    ));
  END LOOP;

  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  IF jsonb_typeof(_slot) <> 'object' THEN _slot := '{}'::jsonb; END IF;
  _old_status := COALESCE(_slot->>'status', 'pending');
  _new_status := COALESCE(_patch->>'status', _old_status);

  IF _old_status IN ('done', 'failed', 'completed', 'cancelled')
     AND _new_status IN ('pending', 'queued', 'rendering', 'processing', 'running') THEN
    _patch := _patch - 'status' - 'output_url' - 'finished_at' - 'error';
  END IF;

  -- v431 G2.1 — Run-Provenienz ist unveraenderlich.
  IF _slot ? 'run_id' AND _slot->'run_id' <> 'null'::jsonb THEN
    _patch := _patch - 'run_id';
  END IF;
  IF _slot ? 'plate_generation' AND _slot->'plate_generation' <> 'null'::jsonb THEN
    _patch := _patch - 'plate_generation';
  END IF;

  -- v431 G3.1f — job_id und pipeline_job_id sind ein Attempt-Paar.
  _has_job := (_patch ? 'job_id') AND (_patch->'job_id' <> 'null'::jsonb);
  _has_ptr := (_patch ? 'pipeline_job_id') AND (_patch->'pipeline_job_id' <> 'null'::jsonb);
  IF _has_job <> _has_ptr THEN
    -- Ein Bindungs-Patch, der nur eine Haelfte traegt, ist nur dann zulaessig,
    -- wenn die andere Haelfte im Slot bereits identisch gebunden ist.
    IF _has_job AND NOT (_slot ? 'pipeline_job_id' AND _slot->'pipeline_job_id' <> 'null'::jsonb) THEN
      RAISE EXCEPTION 'update_dialog_pass_slot: job_id without pipeline_job_id (scene=%, pass=%)', _scene_id, _pass_idx;
    END IF;
    IF _has_ptr AND NOT (_slot ? 'job_id' AND _slot->'job_id' <> 'null'::jsonb) THEN
      RAISE EXCEPTION 'update_dialog_pass_slot: pipeline_job_id without job_id (scene=%, pass=%)', _scene_id, _pass_idx;
    END IF;
  END IF;

  -- Reset ist immer paarweise.
  IF (_patch ? 'job_id') AND _patch->'job_id' = 'null'::jsonb THEN
    _patch := _patch || jsonb_build_object('pipeline_job_id', NULL);
  END IF;
  IF (_patch ? 'pipeline_job_id') AND _patch->'pipeline_job_id' = 'null'::jsonb THEN
    _patch := _patch || jsonb_build_object('job_id', NULL);
  END IF;

  -- v431 G2.2/G3.1f — beide Haelften sind unveraenderlich, sobald gesetzt.
  IF _slot ? 'job_id' AND _slot->'job_id' <> 'null'::jsonb
     AND _patch ? 'job_id' AND _patch->'job_id' <> 'null'::jsonb THEN
    _patch := _patch - 'job_id';
  END IF;
  IF _slot ? 'pipeline_job_id' AND _slot->'pipeline_job_id' <> 'null'::jsonb
     AND _patch ? 'pipeline_job_id' AND _patch->'pipeline_job_id' <> 'null'::jsonb THEN
    _patch := _patch - 'pipeline_job_id';
  END IF;

  _slot := (_slot || _patch || jsonb_build_object('idx', _pass_idx)) - 'slot_padded';
  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text], _slot, true);
  _ds := jsonb_set(_ds, ARRAY['passes'], _arr, true);

  UPDATE public.composer_scenes
  SET dialog_shots = _ds, updated_at = now()
  WHERE id = _scene_id
  RETURNING dialog_shots INTO _new_shots;
  RETURN _new_shots;
END;
$$;

-- ── Bind-RPC: Plate (base_video) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.composer_bind_plate_attempt(
  _pipeline_job_id uuid,
  _external_job_id text,
  _scene_id uuid,
  _run_id uuid,
  _plate_generation integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _scene public.composer_scenes%ROWTYPE;
BEGIN
  IF _pipeline_job_id IS NULL OR _external_job_id IS NULL OR _scene_id IS NULL THEN
    RAISE EXCEPTION 'composer_bind_plate_attempt: missing arguments';
  END IF;

  SELECT * INTO _job FROM public.composer_pipeline_jobs
  WHERE id = _pipeline_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'composer_bind_plate_attempt: job_not_found %', _pipeline_job_id;
  END IF;
  IF _job.stage <> 'base_video' THEN
    RAISE EXCEPTION 'composer_bind_plate_attempt: wrong_stage %', _job.stage;
  END IF;
  IF _job.scene_id IS DISTINCT FROM _scene_id THEN
    RAISE EXCEPTION 'composer_bind_plate_attempt: scene_mismatch';
  END IF;
  IF _job.run_id IS DISTINCT FROM _run_id THEN
    RAISE EXCEPTION 'composer_bind_plate_attempt: run_mismatch';
  END IF;
  IF _job.plate_generation IS DISTINCT FROM _plate_generation THEN
    RAISE EXCEPTION 'composer_bind_plate_attempt: generation_mismatch';
  END IF;

  SELECT * INTO _scene FROM public.composer_scenes
  WHERE id = _job.scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'composer_bind_plate_attempt: scene_not_found';
  END IF;

  IF _job.external_job_id IS NOT DISTINCT FROM _external_job_id
     AND _scene.plate_pipeline_job_id IS NOT DISTINCT FROM _pipeline_job_id
     AND _scene.replicate_prediction_id IS NOT DISTINCT FROM _external_job_id THEN
    RETURN 'noop';
  END IF;

  IF _job.external_job_id IS NOT NULL
     AND _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    RAISE EXCEPTION 'composer_bind_plate_attempt: external_job_id_immutable';
  END IF;
  IF _scene.plate_pipeline_job_id IS NOT NULL
     AND _scene.plate_pipeline_job_id IS DISTINCT FROM _pipeline_job_id THEN
    RAISE EXCEPTION 'composer_bind_plate_attempt: pointer_immutable';
  END IF;

  UPDATE public.composer_pipeline_jobs
  SET external_job_id = _external_job_id,
      status = CASE WHEN status IN ('pending', 'dispatching') THEN 'dispatched' ELSE status END
  WHERE id = _pipeline_job_id;

  UPDATE public.composer_scenes
  SET replicate_prediction_id = _external_job_id,
      plate_pipeline_job_id = _pipeline_job_id,
      updated_at = now()
  WHERE id = _job.scene_id;

  RETURN 'bound';
END;
$$;

REVOKE ALL ON FUNCTION public.composer_bind_plate_attempt(uuid, text, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_bind_plate_attempt(uuid, text, uuid, uuid, integer) TO service_role;

-- ── Bind-RPC: Sync-Pass (sync_segment) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.composer_bind_sync_pass_attempt(
  _pipeline_job_id uuid,
  _external_job_id text,
  _scene_id uuid,
  _pass_idx integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _job public.composer_pipeline_jobs%ROWTYPE;
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _resolved integer;
BEGIN
  IF _pipeline_job_id IS NULL OR _external_job_id IS NULL OR _scene_id IS NULL OR _pass_idx IS NULL THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: missing arguments';
  END IF;

  SELECT * INTO _job FROM public.composer_pipeline_jobs
  WHERE id = _pipeline_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: job_not_found %', _pipeline_job_id;
  END IF;
  IF _job.stage <> 'sync_segment' THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: wrong_stage %', _job.stage;
  END IF;
  IF _job.scene_id IS DISTINCT FROM _scene_id THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: scene_mismatch';
  END IF;

  -- Pass-Identitaetsgate: der Index kommt aus der gelockten Ledger-Zeile,
  -- der Caller darf ihn ausschliesslich bestaetigen.
  IF _job.metadata IS NULL OR (_job.metadata->>'pass_idx') IS NULL THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: pass_identity_missing';
  END IF;
  _resolved := (_job.metadata->>'pass_idx')::integer;
  IF _resolved IS DISTINCT FROM _pass_idx THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: pass_mismatch ledger=% caller=%', _resolved, _pass_idx;
  END IF;

  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _job.scene_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: scene_not_found';
  END IF;

  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array' THEN _ds->'passes' ELSE '[]'::jsonb END;
  IF jsonb_array_length(_arr) <= _pass_idx THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: pass_slot_missing';
  END IF;
  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  IF jsonb_typeof(_slot) <> 'object' THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: pass_slot_invalid';
  END IF;

  -- Speaker-Identitaet bestaetigen, falls die Ledger-Zeile sie traegt.
  IF _job.speaker_id IS NOT NULL AND (_slot->>'speaker_id') IS NOT NULL
     AND (_slot->>'speaker_id') IS DISTINCT FROM _job.speaker_id::text THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: speaker_mismatch';
  END IF;

  -- Run-Provenienz des Slots muss zum Ledger-Attempt passen.
  IF (_slot->>'run_id') IS NOT NULL AND _job.run_id IS NOT NULL
     AND (_slot->>'run_id') IS DISTINCT FROM _job.run_id::text THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: run_mismatch';
  END IF;
  IF (_slot->>'plate_generation') IS NOT NULL AND _job.plate_generation IS NOT NULL
     AND (_slot->>'plate_generation')::integer IS DISTINCT FROM _job.plate_generation THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: generation_mismatch';
  END IF;

  IF _job.external_job_id IS NOT DISTINCT FROM _external_job_id
     AND (_slot->>'job_id') IS NOT DISTINCT FROM _external_job_id
     AND (_slot->>'pipeline_job_id') IS NOT DISTINCT FROM _pipeline_job_id::text THEN
    RETURN 'noop';
  END IF;

  IF _job.external_job_id IS NOT NULL
     AND _job.external_job_id IS DISTINCT FROM _external_job_id THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: external_job_id_immutable';
  END IF;
  IF (_slot->>'job_id') IS NOT NULL AND (_slot->>'job_id') IS DISTINCT FROM _external_job_id THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: pass_job_id_immutable';
  END IF;
  IF (_slot->>'pipeline_job_id') IS NOT NULL
     AND (_slot->>'pipeline_job_id') IS DISTINCT FROM _pipeline_job_id::text THEN
    RAISE EXCEPTION 'composer_bind_sync_pass_attempt: pointer_immutable';
  END IF;

  UPDATE public.composer_pipeline_jobs
  SET external_job_id = _external_job_id,
      status = CASE WHEN status IN ('pending', 'dispatching') THEN 'dispatched' ELSE status END
  WHERE id = _pipeline_job_id;

  _slot := _slot || jsonb_build_object(
    'idx', _pass_idx,
    'job_id', _external_job_id,
    'pipeline_job_id', _pipeline_job_id::text
  );
  _slot := _slot - 'slot_padded';
  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text], _slot, true);
  _ds := jsonb_set(_ds, ARRAY['passes'], _arr, true);

  UPDATE public.composer_scenes
  SET dialog_shots = _ds, updated_at = now()
  WHERE id = _job.scene_id;

  RETURN 'bound';
END;
$$;

REVOKE ALL ON FUNCTION public.composer_bind_sync_pass_attempt(uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_bind_sync_pass_attempt(uuid, text, uuid, integer) TO service_role;