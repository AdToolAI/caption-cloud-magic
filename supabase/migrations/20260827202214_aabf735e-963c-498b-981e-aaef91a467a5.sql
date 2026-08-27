-- ═══════════════════════════════════════════════════════════════════════════
-- V520 P1-B — FIRST-TERMINAL DIAGNOSTIC FREEZE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Scene 67b392b1, generation 17. The first true terminal failure was Sarah,
-- pass 1, `v187_preclip_required_no_fullplate_fallback` at 15:12:10. A later
-- sibling, Samuel on pass 2, then failed with `bbox_zero_voiced_frames` — and
-- the user-facing summary ended up a chimera of the two:
--
--   dialog_shots.error            Sarah   (correctly frozen)
--   composer_scenes.clip_error    Samuel  (overwritten)
--   v510_terminal.reason          Sarah   (correctly frozen)
--   v510_terminal.at              Sarah   (correctly frozen)
--   v510_terminal.pass_idx        2       (Samuel's, attached to Sarah's reason)
--
-- Two defects, both in this function, both narrow:
--
--   1. `pass_idx` used COALESCE(existing, incoming). The first terminal came
--      through `failLipSync`, which passes `_pass_idx = NULL` on purpose (it
--      terminalizes a SCENE, not a pass). NULL is not "absent, fill it in
--      later" — it is the first terminal's answer, and a later sibling's index
--      is not a better one. It now stays NULL forever.
--
--   2. `clip_error` was written with COALESCE on EVERY call, so a later
--      sibling replaced the root user-facing error. The root patch already
--      strips `error` for non-first callers (line below, unchanged) — the two
--      fields simply had different freeze rules. They now have the same one.
--
-- Everything else is byte-identical to the V510 body: lock order, monotonic
-- marker, run fence, `passes` isolation, refund bookkeeping, the `? 'key'`
-- clearing semantics for clip_url, SECURITY DEFINER, search_path and the
-- service_role-only grant. Later sibling results stay fully observable through
-- pipeline jobs, the transition log and their own pass slots; only the ROOT
-- user-facing summary is frozen.

CREATE OR REPLACE FUNCTION public.composer_terminalize_dialog_run(
  _scene_id uuid,
  _run_id text,
  _pass_idx integer,
  _pass_patch jsonb,
  _root_patch jsonb,
  _scene_patch jsonb,
  _terminal_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  _ds jsonb;
  _arr jsonb;
  _slot jsonb;
  _existing jsonb;
  _first_terminal boolean;
  _marker jsonb;
BEGIN
  IF _pass_idx IS NOT NULL AND (_pass_patch IS NULL OR jsonb_typeof(_pass_patch) <> 'object') THEN
    RAISE EXCEPTION 'composer_terminalize_dialog_run: pass patch must be a jsonb object';
  END IF;
  IF _pass_idx IS NOT NULL AND _pass_idx < 0 THEN
    RAISE EXCEPTION 'composer_terminalize_dialog_run: negative pass index %', _pass_idx;
  END IF;

  SELECT COALESCE(dialog_shots, '{}'::jsonb) INTO _ds
  FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE;
  IF _ds IS NULL THEN
    RAISE EXCEPTION 'composer_terminalize_dialog_run: scene_not_found %', _scene_id;
  END IF;

  _existing := _ds -> 'v510_terminal';
  -- Idempotent per run: the FIRST terminal reason of a run is the one that
  -- stands. A second failing sibling still records its own slot below.
  _first_terminal := NOT (
    jsonb_typeof(_existing) = 'object'
    AND COALESCE(_existing ->> 'run_id', '') = COALESCE(_run_id, '')
  );

  -- ── own slot only ────────────────────────────────────────────────────────
  -- A NULL pass index means the run died before any pass owned a slot (plate
  -- probe, audio preflight). Root + marker still apply; no slot is touched.
  IF _pass_idx IS NOT NULL THEN
  _arr := CASE WHEN jsonb_typeof(_ds->'passes') = 'array'
               THEN _ds->'passes' ELSE '[]'::jsonb END;
  WHILE jsonb_array_length(_arr) <= _pass_idx LOOP
    _arr := _arr || jsonb_build_array(jsonb_build_object(
      'idx', jsonb_array_length(_arr), 'status', 'pending', 'slot_padded', true
    ));
  END LOOP;
  _slot := COALESCE(_arr->_pass_idx, '{}'::jsonb);
  IF jsonb_typeof(_slot) <> 'object' THEN _slot := '{}'::jsonb; END IF;
  -- Never let a failure erase transport pointers this slot already holds.
  _slot := (_slot || _pass_patch || jsonb_build_object('idx', _pass_idx)) - 'slot_padded';
  _arr := jsonb_set(_arr, ARRAY[_pass_idx::text], _slot, true);
  _ds := jsonb_set(_ds, ARRAY['passes'], _arr, true);
  END IF;

  -- ── root merge — `passes` can never be supplied from outside ─────────────
  IF _root_patch IS NOT NULL AND jsonb_typeof(_root_patch) = 'object' THEN
    IF _first_terminal THEN
      _ds := _ds || (_root_patch - 'passes');
    ELSE
      -- A later sibling failure must not rewrite the first terminal reason,
      -- finished_at or refund bookkeeping.
      _ds := _ds || ((_root_patch - 'passes') - 'error' - 'finished_at' - 'refunded' - 'v459_refund');
    END IF;
  END IF;

  _marker := COALESCE(_existing, '{}'::jsonb) || jsonb_build_object(
    'run_id', _run_id,
    'reason', CASE WHEN _first_terminal THEN _terminal_reason
                   ELSE COALESCE(_existing ->> 'reason', _terminal_reason) END,
    -- V520: NEVER backfill. A NULL first answer is an answer.
    'pass_idx', CASE WHEN _first_terminal THEN to_jsonb(_pass_idx)
                     ELSE (_existing -> 'pass_idx') END,
    'at', CASE WHEN _first_terminal THEN to_jsonb(now())
               ELSE COALESCE(_existing -> 'at', to_jsonb(now())) END
  );
  _ds := jsonb_set(_ds, ARRAY['v510_terminal'], _marker, true);

  -- `? 'key'` rather than COALESCE for the nullable columns: a terminal write
  -- must be able to CLEAR clip_url / lip_sync_source_clip_url (the v153
  -- needs_clip_rerender path does exactly that), which COALESCE cannot express.
  UPDATE public.composer_scenes
  SET dialog_shots = _ds,
      lip_sync_status = COALESCE(_scene_patch ->> 'lip_sync_status', lip_sync_status),
      twoshot_stage   = COALESCE(_scene_patch ->> 'twoshot_stage', twoshot_stage),
      -- V520: the root user-facing error obeys the same first-terminal rule
      -- as `dialog_shots.error`, which the root merge above already froze.
      clip_error      = CASE WHEN _first_terminal
                             THEN COALESCE(_scene_patch ->> 'clip_error', clip_error)
                             ELSE clip_error END,
      clip_status     = COALESCE(_scene_patch ->> 'clip_status', clip_status),
      clip_url        = CASE WHEN _scene_patch ? 'clip_url'
                             THEN _scene_patch ->> 'clip_url' ELSE clip_url END,
      lip_sync_source_clip_url = CASE WHEN _scene_patch ? 'lip_sync_source_clip_url'
                             THEN _scene_patch ->> 'lip_sync_source_clip_url'
                             ELSE lip_sync_source_clip_url END,
      updated_at = now()
  WHERE id = _scene_id;

  RETURN jsonb_build_object(
    'terminal', _marker,
    'first_terminal', _first_terminal,
    'dialog_shots', _ds
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.composer_terminalize_dialog_run(
  uuid, text, integer, jsonb, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.composer_terminalize_dialog_run(
  uuid, text, integer, jsonb, jsonb, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.composer_terminalize_dialog_run(
  uuid, text, integer, jsonb, jsonb, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_terminalize_dialog_run(
  uuid, text, integer, jsonb, jsonb, jsonb, text) TO service_role;