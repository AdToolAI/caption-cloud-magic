REVOKE ALL ON FUNCTION public.composer_acquire_pipeline_attempt(uuid, uuid, text, integer, integer, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.composer_replace_pipeline_attempt(uuid, uuid, uuid, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.composer_acquire_pipeline_attempt(uuid, uuid, text, integer, integer, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.composer_replace_pipeline_attempt(uuid, uuid, uuid, text, integer, text, jsonb) TO service_role;