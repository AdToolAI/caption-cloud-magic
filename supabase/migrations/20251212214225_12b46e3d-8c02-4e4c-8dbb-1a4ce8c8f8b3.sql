-- Sessions Tracking für "Aktive Sitzungen" Feature
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_token TEXT,
  device_info TEXT,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now(),
  is_current BOOLEAN DEFAULT false
);

-- Index für schnelle Abfragen
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_last_active ON public.user_sessions(last_active);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own sessions"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sessions"
  ON public.user_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sessions"
  ON public.user_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own sessions"
  ON public.user_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Cleanup alte Sessions (älter als 30 Tage)
CREATE OR REPLACE FUNCTION public.cleanup_old_user_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.user_sessions
  WHERE last_active < now() - INTERVAL '30 days';
END;
$$;