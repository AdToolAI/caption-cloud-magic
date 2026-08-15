-- v431 RS3 §7 — Security-Härtung: kein PUBLIC/anon/authenticated auf den
-- neuen Primitiven. Nur service_role darf die Einstiegspunkte ausführen,
-- interne Helper haben gar keinen direkten Grantee.
REVOKE ALL ON FUNCTION public.composer_reset_lipsync_with_attempt_cancellation(uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.composer_acquire_lipsync_attempt_serialized(uuid, uuid, text, integer, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.composer_acquire_reset_rearmed_attempt(uuid, uuid, text, integer, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.composer_rs3_fence_verdict(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.composer_reset_lipsync_with_attempt_cancellation(uuid, uuid, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.composer_acquire_lipsync_attempt_serialized(uuid, uuid, text, integer, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.composer_acquire_reset_rearmed_attempt(uuid, uuid, text, integer, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.composer_rs3_fence_verdict(uuid, uuid) TO service_role;

-- Interne Helper: kein direkter Aufruf von aussen, auch nicht durch service_role.
REVOKE ALL ON FUNCTION public.composer_rs3_acquire_core(uuid, uuid, text, integer, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.composer_rs3_is_pre_reset_attempt(jsonb, uuid, integer, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.composer_rs3_reset_cancellable_statuses() FROM PUBLIC, anon, authenticated, service_role;