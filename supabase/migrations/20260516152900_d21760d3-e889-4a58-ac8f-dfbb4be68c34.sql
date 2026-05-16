-- Restrict misconfigured "service role" policies from public role to service_role only
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND (qual='true' OR with_check='true')
      AND cmd <> 'SELECT'
      AND 'public' = ANY(roles)
      AND (policyname ILIKE 'Service role%'
           OR policyname ILIKE 'Service can%'
           OR policyname ILIKE 'System can%'
           OR policyname ILIKE 'stock_video_cache % by service')
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO service_role', r.policyname, r.tablename);
  END LOOP;
END $$;