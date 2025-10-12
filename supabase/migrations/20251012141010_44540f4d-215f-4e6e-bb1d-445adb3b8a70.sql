-- ============================================
-- SECURITY FIX: Enable RLS on Missing Tables
-- ============================================

-- Enable RLS on rate_limits (no policies needed - only accessed via functions)
-- This prevents direct client access
ALTER TABLE IF EXISTS public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies for rate_limits - should only be accessed via edge functions
-- This prevents any direct client access

-- Enable leaked password protection in auth settings
-- Note: This requires Supabase dashboard configuration but we can set the foundation

-- Verify all critical tables have RLS enabled
DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    AND tablename NOT IN (
      'schema_migrations',
      'settings' -- system table
    )
  LOOP
    -- Enable RLS if not already enabled
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
    RAISE NOTICE 'Ensured RLS is enabled on: %', tbl.tablename;
  END LOOP;
END $$;