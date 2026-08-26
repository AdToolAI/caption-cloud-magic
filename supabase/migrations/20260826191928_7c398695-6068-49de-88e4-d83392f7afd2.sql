-- ═══════════════════════════════════════════════════════════════════════════
-- V510-P0 SECURITY HOTFIX — RESTRICT ORCHESTRATION RPC EXECUTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Production inspection after the V510-P0 deploy found two of the four new
-- RPCs executable by `authenticated`:
--
--   composer_terminalize_dialog_run      anon=false  authenticated=TRUE
--   composer_touch_dialog_run_progress   anon=false  authenticated=TRUE
--   composer_reconcile_terminal_sync_result   anon=false  authenticated=false
--   composer_adopt_sync_callback_binding      anon=false  authenticated=false
--
-- The cause is an omission in 20260826160000_v510_monotonic_terminalization:
-- the first two functions revoke from PUBLIC and anon only, while the two
-- written later also revoke from `authenticated`. `REVOKE ALL FROM PUBLIC`
-- does not remove Supabase's explicit default EXECUTE grant to the
-- `authenticated` role, so that grant survived on exactly those two.
--
-- Why it matters: both are SECURITY DEFINER backend orchestration primitives.
-- Neither consults auth.uid() or any ownership predicate — they take a scene
-- id and a run id and act. A signed-in user could therefore terminalize
-- someone else's lip-sync run (writing a terminal marker, a failure reason and
-- a refund flag), or drive root progress state, on any scene id they could
-- guess. The functions are correct; their reachability was not.
--
-- Privileges only. No function body is recreated here, so no behaviour, no
-- signature and no `search_path` changes — a redefinition would also silently
-- reset the ACL, which is precisely the class of accident being fixed.
--
-- The two already-correct functions are deliberately untouched: re-issuing
-- their grants would suggest they were wrong, and they were not.

-- ── composer_terminalize_dialog_run ────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.composer_terminalize_dialog_run(
  uuid, text, integer, jsonb, jsonb, jsonb, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.composer_terminalize_dialog_run(
  uuid, text, integer, jsonb, jsonb, jsonb, text
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.composer_terminalize_dialog_run(
  uuid, text, integer, jsonb, jsonb, jsonb, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_terminalize_dialog_run(
  uuid, text, integer, jsonb, jsonb, jsonb, text
) TO service_role;

-- ── composer_touch_dialog_run_progress ─────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.composer_touch_dialog_run_progress(
  uuid, text, jsonb, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.composer_touch_dialog_run_progress(
  uuid, text, jsonb, jsonb
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.composer_touch_dialog_run_progress(
  uuid, text, jsonb, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_touch_dialog_run_progress(
  uuid, text, jsonb, jsonb
) TO service_role;