CREATE OR REPLACE FUNCTION public.composer_recover_scene(_expected_run_id uuid, _expected_plate_generation integer, _scene_id uuid, _to composer_scene_state, _reason text, _write_id text)
 RETURNS TABLE(applied boolean, state composer_scene_state, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    _cur public.composer_scenes%ROWTYPE;
    _caller_role text;
    _fail text := NULL;
BEGIN
    _caller_role := coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'role',
        current_setting('request.jwt.claim.role', true),
        ''
    );
    IF _caller_role != 'service_role' THEN
        RETURN QUERY SELECT false, NULL::public.composer_scene_state, 'forbidden'::text;
        RETURN;
    END IF;

    SELECT * INTO _cur FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::public.composer_scene_state, 'scene_not_found'::text;
        RETURN;
    END IF;

    IF _to NOT IN ('failed', 'canceled') THEN
        _fail := 'invalid_recovery_target';
    ELSIF _reason IS NULL OR _reason NOT IN ('watchdog_timeout', 'stuck_clip_recovery', 'orphaned_job', 'orphaned_run', 'manual_admin') THEN
        _fail := 'invalid_recovery_reason';
    ELSIF _expected_plate_generation IS NULL THEN
        _fail := 'plate_generation_required';
    ELSIF _cur.plate_generation IS DISTINCT FROM _expected_plate_generation THEN
        _fail := 'stale_generation';
    ELSIF _reason != 'orphaned_run' AND _expected_run_id IS NULL THEN
        _fail := 'expected_run_id_required';
    ELSIF _reason = 'orphaned_run' THEN
        IF _cur.active_run_id IS NOT NULL THEN
            _fail := 'run_reappeared';
        END IF;
    ELSIF _cur.active_run_id IS DISTINCT FROM _expected_run_id THEN
        _fail := 'stale_recovery';
    END IF;

    IF _fail IS NOT NULL THEN
        INSERT INTO public.composer_scene_transition_log (
            scene_id, project_id, from_state, to_state, step_index, is_intermediate,
            guard_mode, runless_reason, run_id, generation, write_id, applied, reason,
            source_signature, caller_class, caller_role, auth_uid
        )
        VALUES (
            _scene_id, _cur.project_id, _cur.pipeline_state, _to, 1, false,
            'recovery', _reason, _expected_run_id, _expected_plate_generation, _write_id, false, _fail,
            'recovery', 'recovery', _caller_role, auth.uid()
        );
        RETURN QUERY SELECT false, _cur.pipeline_state, _fail;
        RETURN;
    END IF;

    UPDATE public.composer_scenes
    SET pipeline_state = _to,
        pipeline_state_at = now(),
        pipeline_detail = 'recovery:' || _reason,
        pipeline_state_run_id = NULL,
        updated_at = now()
    WHERE id = _scene_id;

    INSERT INTO public.composer_scene_transition_log (
        scene_id, project_id, from_state, to_state, step_index, is_intermediate,
        guard_mode, runless_reason, run_id, generation, write_id, applied,
        source_signature, caller_class, caller_role, auth_uid
    )
    VALUES (
        _scene_id, _cur.project_id, _cur.pipeline_state, _to, 1, false,
        'recovery', _reason, _expected_run_id, _expected_plate_generation, _write_id, true,
        'recovery', 'recovery', _caller_role, auth.uid()
    );

    RETURN QUERY SELECT true, _to, 'success'::text;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.composer_recover_scene(uuid, integer, uuid, composer_scene_state, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_recover_scene(uuid, integer, uuid, composer_scene_state, text, text) TO service_role;