REVOKE EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.composer_apply_sync_segment_result(uuid, text, text, text, text, text) TO service_role;