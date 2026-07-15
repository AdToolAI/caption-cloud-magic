
CREATE OR REPLACE FUNCTION public.render_queue_stats()
RETURNS TABLE (slots_used integer, queued_count integer, founder_queued integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN status IN ('processing','rendering') THEN GREATEST(1, COALESCE(estimated_workers, 5)) ELSE 0 END), 0)::int AS slots_used,
    COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0)::int AS queued_count,
    COALESCE(SUM(CASE WHEN status = 'queued' AND is_founder = true THEN 1 ELSE 0 END), 0)::int AS founder_queued
  FROM public.render_queue
  WHERE status IN ('queued','processing','rendering');
$$;

GRANT EXECUTE ON FUNCTION public.render_queue_stats() TO authenticated, anon;
