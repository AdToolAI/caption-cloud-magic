DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'sandbox_exec%' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.composer_reap_orphaned_dispatches(integer) TO %I', r);
  END LOOP;
END $$;