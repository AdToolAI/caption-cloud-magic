-- v431 RS3 — TEMPORÄRER Ad-hoc-Grant für die Sandbox-Testrolle (kein Runtime-Artefakt).
-- Wird unmittelbar nach der Smoke-Matrix wieder revoked.
GRANT EXECUTE ON FUNCTION public.composer_rs3_reset_cancellable_statuses() TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_reset_lipsync_with_attempt_cancellation(uuid, uuid, integer, boolean) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_rs3_acquire_core(uuid, uuid, text, integer, uuid, text, jsonb, boolean) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_acquire_reset_rearmed_attempt(uuid, uuid, text, integer, uuid, text, jsonb) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_acquire_lipsync_attempt_serialized(uuid, uuid, text, integer, uuid, text, jsonb) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_rs3_is_pre_reset_attempt(jsonb, uuid, integer, uuid, integer, jsonb) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_rs3_fence_verdict(uuid, uuid) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_apply_sync_segment_result_core(uuid, text, text, text, text, text) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_acquire_pipeline_attempt(uuid, uuid, text, integer, integer, uuid, uuid, text, jsonb) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.composer_log_sync_segment_audit(uuid, uuid, composer_scene_state, composer_scene_state, uuid, integer, text, boolean, text, jsonb) TO sandbox_exec;