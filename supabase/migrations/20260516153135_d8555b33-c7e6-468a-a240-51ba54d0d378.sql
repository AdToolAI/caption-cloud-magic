DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='v' AND n.nspname='public'
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.nspname, r.relname);
  END LOOP;
END $$;