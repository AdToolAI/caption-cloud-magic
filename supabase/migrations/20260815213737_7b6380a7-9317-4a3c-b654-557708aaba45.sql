-- v431 RS3 — Rücknahme des temporären Ad-hoc-Grants nach der Smoke-Matrix.
REVOKE EXECUTE ON FUNCTION public.composer_rs3_reset_cancellable_statuses() FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_reset_lipsync_with_attempt_cancellation(uuid, uuid, integer, boolean) FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_rs3_acquire_core(uuid, uuid, text, integer, uuid, text, jsonb, boolean) FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_acquire_reset_rearmed_attempt(uuid, uuid, text, integer, uuid, text, jsonb) FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_acquire_lipsync_attempt_serialized(uuid, uuid, text, integer, uuid, text, jsonb) FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_rs3_is_pre_reset_attempt(jsonb, uuid, integer, uuid, integer, jsonb) FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_rs3_fence_verdict(uuid, uuid) FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_apply_sync_segment_result_core(uuid, text, text, text, text, text) FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_acquire_pipeline_attempt(uuid, uuid, text, integer, integer, uuid, uuid, text, jsonb) FROM sandbox_exec;
REVOKE EXECUTE ON FUNCTION public.composer_log_sync_segment_audit(uuid, uuid, composer_scene_state, composer_scene_state, uuid, integer, text, boolean, text, jsonb) FROM sandbox_exec;