-- Rate limiting: Max 4 concurrent publishes per user
CREATE TABLE IF NOT EXISTS public.active_publishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_publishes_user ON public.active_publishes(user_id);
CREATE INDEX IF NOT EXISTS idx_active_publishes_job ON public.active_publishes(job_id);

-- RLS Policies
ALTER TABLE public.active_publishes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own active publishes"
ON public.active_publishes
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own active publishes"
ON public.active_publishes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own active publishes"
ON public.active_publishes
FOR DELETE
USING (auth.uid() = user_id);

-- Cleanup function for old records (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_active_publishes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.active_publishes
  WHERE started_at < now() - INTERVAL '1 hour';
END;
$function$;