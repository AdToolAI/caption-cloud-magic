DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'sandbox_exec%' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.composer_acquire_pipeline_attempt(uuid, uuid, text, integer, integer, uuid, uuid, text, jsonb) TO %I', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.composer_replace_pipeline_attempt(uuid, uuid, uuid, text, integer, text, jsonb) TO %I', r);
  END LOOP;
END $$;