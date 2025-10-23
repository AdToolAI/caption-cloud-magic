-- Update has_role function if needed
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create publish_logs table
CREATE TABLE IF NOT EXISTS public.publish_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  duration_ms INTEGER,
  job_id UUID REFERENCES publish_jobs(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publish_logs_user_id ON public.publish_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_publish_logs_provider ON public.publish_logs(provider);
CREATE INDEX IF NOT EXISTS idx_publish_logs_created_at ON public.publish_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_publish_logs_status ON public.publish_logs(status);

-- Enable RLS
ALTER TABLE public.publish_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for publish_logs
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'publish_logs' AND policyname = 'Users can view own logs'
  ) THEN
    CREATE POLICY "Users can view own logs"
      ON public.publish_logs
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'publish_logs' AND policyname = 'System can insert logs'
  ) THEN
    CREATE POLICY "System can insert logs"
      ON public.publish_logs
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'publish_logs' AND policyname = 'Admins can view all logs'
  ) THEN
    CREATE POLICY "Admins can view all logs"
      ON public.publish_logs
      FOR SELECT
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- View 1: Active publishes per user
CREATE OR REPLACE VIEW v_active_publishes AS
SELECT
  user_id,
  COUNT(*) as active_count,
  MIN(started_at) as oldest_started
FROM active_publishes
GROUP BY user_id;

-- View 2: Average duration per provider (last 7 days)
CREATE OR REPLACE VIEW v_avg_duration AS
SELECT
  provider,
  ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
  COUNT(*) as total_count
FROM publish_logs
WHERE created_at > now() - INTERVAL '7 days'
  AND duration_ms IS NOT NULL
GROUP BY provider;

-- View 3: Success rate per provider
CREATE OR REPLACE VIEW v_success_rate AS
SELECT
  provider,
  COUNT(*) FILTER (WHERE status='ok')::float / GREATEST(COUNT(*), 1) as success_ratio,
  COUNT(*) FILTER (WHERE status='ok') as success_count,
  COUNT(*) FILTER (WHERE status='error') as error_count,
  COUNT(*) as total_count
FROM publish_logs
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY provider;

-- View 4: Quota usage (fixed ROUND casting)
CREATE OR REPLACE VIEW v_quota_usage AS
SELECT
  s.user_id,
  s.quota_mb,
  s.used_mb,
  ROUND(((s.used_mb::numeric / GREATEST(s.quota_mb, 1)::numeric) * 100)::numeric, 2) as usage_percent
FROM user_storage s;

-- View 5: Cron summary
CREATE OR REPLACE VIEW v_cron_summary AS
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
  COUNT(*) FILTER (WHERE status='ok') as success_runs,
  COUNT(*) FILTER (WHERE status='error') as error_runs,
  COUNT(*) as total_runs
FROM publish_logs
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC
LIMIT 168;