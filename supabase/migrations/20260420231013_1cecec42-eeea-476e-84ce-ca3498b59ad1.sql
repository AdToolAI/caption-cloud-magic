-- DELETE policies for admins
CREATE POLICY "Admins can delete superuser runs"
ON public.ai_superuser_runs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete superuser anomalies"
ON public.ai_superuser_anomalies
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Cleanup RPC: keep last N runs per scenario, delete the rest
CREATE OR REPLACE FUNCTION public.cleanup_superuser_runs(keep_per_scenario int DEFAULT 5)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY scenario_name ORDER BY started_at DESC) AS rn
    FROM public.ai_superuser_runs
  )
  DELETE FROM public.ai_superuser_runs
  WHERE id IN (SELECT id FROM ranked WHERE rn > keep_per_scenario);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;