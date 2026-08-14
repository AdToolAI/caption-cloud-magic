CREATE OR REPLACE FUNCTION public.composer_scene_transition_core(_scene_id uuid, _to composer_scene_state, _guard_mode text, _run_id uuid, _generation integer, _runless_reason text, _write_id text, _from composer_scene_state[] DEFAULT NULL::composer_scene_state[], _detail text DEFAULT NULL::text, _substate text DEFAULT NULL::text, _error_text text DEFAULT NULL::text, _clear_detail boolean DEFAULT false, _clear_substate boolean DEFAULT false, _clear_error boolean DEFAULT false, _source_signature text DEFAULT NULL::text, _caller_class text DEFAULT NULL::text)
 RETURNS TABLE(applied boolean, state composer_scene_state, substate text, reason text, path composer_scene_state[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    _cur public.composer_scenes%ROWTYPE;
    _caller_role text;
    _auth_uid uuid;
    _reason text := NULL;
    _linear_chain public.composer_scene_state[] := ARRAY['idle', 'plate_queued', 'plate_rendering', 'plate_ready', 'audio_prep', 'audio_ready', 'lipsync_dispatched', 'lipsync_running', 'lipsync_muxing', 'complete']::public.composer_scene_state[];
    _path public.composer_scene_state[];
    _step public.composer_scene_state;
    _i integer;
BEGIN
    _caller_role := coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'role',
        current_setting('request.jwt.claim.role', true),
        ''
    );

    SELECT * INTO _cur FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::public.composer_scene_state, NULL::text, 'scene_not_found'::text, NULL::public.composer_scene_state[];
        RETURN;
    END IF;

    IF _caller_role != 'service_role' THEN
        _auth_uid := (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
        IF _auth_uid IS NULL THEN
            _reason := 'forbidden';
        ELSIF NOT public.can_edit_composer_project(_cur.project_id, _auth_uid) THEN
            _reason := 'forbidden';
        END IF;
    END IF;

    IF _reason IS NULL THEN
        IF (_run_id IS NULL AND _generation IS NOT NULL) OR (_run_id IS NOT NULL AND _generation IS NULL) THEN
            _reason := 'guard_args_missing';
        END IF;
    END IF;

    IF _reason IS NULL THEN
        IF _guard_mode = 'run_bound' THEN
            IF _cur.active_run_id IS DISTINCT FROM _run_id THEN
                _reason := 'stale_run';
            ELSIF _cur.plate_generation IS DISTINCT FROM _generation THEN
                _reason := 'stale_generation';
            END IF;
        ELSIF _guard_mode = 'runless' THEN
            IF _run_id IS NOT NULL OR _generation IS NOT NULL THEN
                _reason := 'guard_mode_conflict';
            ELSIF _runless_reason IS NULL THEN
                _reason := 'runless_reason_required';
            ELSE
                IF _caller_class = 'v2' THEN
                    IF _runless_reason = 'system_migration' THEN
                        _reason := 'runless_reason_not_allowed_for_caller';
                    ELSIF _runless_reason NOT IN ('user_cancel_no_active_run', 'project_teardown_no_active_run', 'image_scene_no_run_context') THEN
                        _reason := 'runless_reason_invalid';
                    ELSIF _cur.active_run_id IS NOT NULL THEN
                        _reason := 'run_reappeared';
                    END IF;
                ELSIF _caller_class = 'legacy' THEN
                    IF _runless_reason != 'system_migration' THEN
                        _reason := 'runless_reason_invalid';
                    END IF;
                END IF;
            END IF;
        ELSE
            _reason := 'invalid_guard_mode';
        END IF;
    END IF;

    IF _reason IS NULL THEN
        IF _caller_class = 'v2' AND _source_signature != 'v2' THEN
            _reason := 'signature_mismatch';
        ELSIF _caller_class = 'legacy' AND _source_signature NOT IN ('legacy_6', 'legacy_7') THEN
            _reason := 'signature_mismatch';
        END IF;
    END IF;

    IF _reason IS NOT NULL THEN
        INSERT INTO public.composer_scene_transition_log (
            scene_id, project_id, from_state, to_state, step_index, is_intermediate,
            guard_mode, runless_reason, run_id, generation, write_id, applied, reason,
            source_signature, caller_class, caller_role, auth_uid
        )
        VALUES (
            _scene_id, _cur.project_id, _cur.pipeline_state, _to, 1, false,
            _guard_mode, _runless_reason, _run_id, _generation, _write_id, false, _reason,
            _source_signature, _caller_class, _caller_role, auth.uid()
        );
        RETURN QUERY SELECT false, _cur.pipeline_state, _cur.pipeline_substate, _reason, NULL::public.composer_scene_state[];
        RETURN;
    END IF;

    IF _from IS NOT NULL AND array_length(_from, 1) > 0 AND NOT (_cur.pipeline_state = ANY(_from)) THEN
        _reason := 'unexpected_from_state';
        INSERT INTO public.composer_scene_transition_log (
            scene_id, project_id, from_state, to_state, step_index, is_intermediate,
            guard_mode, runless_reason, run_id, generation, write_id, applied, reason,
            source_signature, caller_class, caller_role, auth_uid
        )
        VALUES (
            _scene_id, _cur.project_id, _cur.pipeline_state, _to, 1, false,
            _guard_mode, _runless_reason, _run_id, _generation, _write_id, false, _reason,
            _source_signature, _caller_class, _caller_role, auth.uid()
        );
        RETURN QUERY SELECT false, _cur.pipeline_state, _cur.pipeline_substate, _reason, NULL::public.composer_scene_state[];
        RETURN;
    END IF;

    IF _guard_mode = 'runless' THEN
        IF _caller_class = 'v2' THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.composer_runless_transition_rules AS rr
                WHERE rr.reason = _runless_reason
                  AND rr.write_id = _write_id
                  AND rr.from_state = _cur.pipeline_state
                  AND rr.to_state = _to
            ) THEN
                _reason := 'runless_edge_not_allowed';
            END IF;
        ELSIF _caller_class = 'legacy' THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.composer_transition_grandfather AS gf
                WHERE gf.source_signature = _source_signature
                  AND gf.write_id = _write_id
                  AND gf.from_state = _cur.pipeline_state
                  AND gf.to_state = _to
            ) THEN
                _reason := 'runless_not_grandfathered';
            END IF;
        END IF;
    END IF;

    IF _reason IS NOT NULL THEN
        INSERT INTO public.composer_scene_transition_log (
            scene_id, project_id, from_state, to_state, step_index, is_intermediate,
            guard_mode, runless_reason, run_id, generation, write_id, applied, reason,
            source_signature, caller_class, caller_role, auth_uid
        )
        VALUES (
            _scene_id, _cur.project_id, _cur.pipeline_state, _to, 1, false,
            _guard_mode, _runless_reason, _run_id, _generation, _write_id, false, _reason,
            _source_signature, _caller_class, _caller_role, auth.uid()
        );
        RETURN QUERY SELECT false, _cur.pipeline_state, _cur.pipeline_substate, _reason, NULL::public.composer_scene_state[];
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.composer_scene_transitions AS st
        WHERE st.from_state = _cur.pipeline_state AND st.to_state = _to
    ) THEN
        _path := ARRAY[_to];
    ELSE
        WITH RECURSIVE path_search AS (
            SELECT t.from_state, t.to_state, ARRAY[t.to_state] AS path_nodes
            FROM public.composer_scene_transitions t
            WHERE t.from_state = _cur.pipeline_state
              AND t.from_state = ANY(_linear_chain)
              AND t.to_state = ANY(_linear_chain)
              AND t.to_state != 'idle'
              AND t.to_state != t.from_state
            UNION ALL
            SELECT t.from_state, t.to_state, ps.path_nodes || t.to_state
            FROM public.composer_scene_transitions t
            JOIN path_search ps ON t.from_state = ps.to_state
            WHERE t.from_state = ANY(_linear_chain)
              AND t.to_state = ANY(_linear_chain)
              AND NOT (t.to_state = ANY(ps.path_nodes))
              AND array_length(ps.path_nodes, 1) < 5
              AND t.to_state != 'idle'
              AND t.to_state != t.from_state
              AND array_position(_linear_chain, t.to_state) > array_position(_linear_chain, t.from_state)
        )
        SELECT ps.path_nodes INTO _path FROM path_search ps WHERE ps.to_state = _to ORDER BY array_length(ps.path_nodes, 1) ASC LIMIT 1;
    END IF;

    IF _path IS NULL THEN
        _reason := 'transition_not_allowed';
        INSERT INTO public.composer_scene_transition_log (
            scene_id, project_id, from_state, to_state, step_index, is_intermediate,
            guard_mode, runless_reason, run_id, generation, write_id, applied, reason,
            source_signature, caller_class, caller_role, auth_uid
        )
        VALUES (
            _scene_id, _cur.project_id, _cur.pipeline_state, _to, 1, false,
            _guard_mode, _runless_reason, _run_id, _generation, _write_id, false, _reason,
            _source_signature, _caller_class, _caller_role, auth.uid()
        );
        RETURN QUERY SELECT false, _cur.pipeline_state, _cur.pipeline_substate, _reason, NULL::public.composer_scene_state[];
        RETURN;
    END IF;

    UPDATE public.composer_scenes
    SET pipeline_state = _to,
        pipeline_substate = CASE WHEN _clear_substate THEN NULL ELSE COALESCE(_substate, pipeline_substate) END,
        pipeline_detail = CASE WHEN _clear_detail THEN NULL ELSE COALESCE(_detail, pipeline_detail) END,
        pipeline_error_text = CASE WHEN _clear_error THEN NULL ELSE COALESCE(_error_text, pipeline_error_text) END,
        pipeline_state_at = now(),
        pipeline_state_run_id = CASE WHEN _guard_mode = 'run_bound' THEN _run_id ELSE NULL END,
        updated_at = now()
    WHERE id = _scene_id;

    _step := _cur.pipeline_state;
    FOR _i IN 1..array_length(_path, 1) LOOP
        INSERT INTO public.composer_scene_transition_log (
            scene_id, project_id, from_state, to_state, step_index, is_intermediate,
            guard_mode, runless_reason, run_id, generation, write_id, applied,
            source_signature, caller_class, caller_role, auth_uid
        )
        VALUES (
            _scene_id, _cur.project_id, _step, _path[_i], _i, (_i < array_length(_path, 1)),
            _guard_mode, _runless_reason, _run_id, _generation, _write_id, true,
            _source_signature, _caller_class, _caller_role, auth.uid()
        );
        _step := _path[_i];
    END LOOP;

    RETURN QUERY SELECT true, _to, (CASE WHEN _clear_substate THEN NULL ELSE COALESCE(_substate, _cur.pipeline_substate) END), 'success'::text, _path;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.composer_scene_transition_core(uuid, composer_scene_state, text, uuid, integer, text, text, composer_scene_state[], text, text, text, boolean, boolean, boolean, text, text) FROM PUBLIC, anon, authenticated, service_role;