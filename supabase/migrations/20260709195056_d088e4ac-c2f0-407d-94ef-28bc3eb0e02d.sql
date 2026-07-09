
CREATE TABLE public.plan_repair_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID,
  duration_source TEXT,
  scene_count INTEGER,
  total_duration_sec NUMERIC,
  previous_total NUMERIC,
  previous_sum NUMERIC,
  consistent BOOLEAN NOT NULL DEFAULT true,
  repair_kinds TEXT[] NOT NULL DEFAULT '{}',
  repair_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions TEXT[] NOT NULL DEFAULT '{}',
  fidelity_mode TEXT,
  script_timing_mode TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.plan_repair_events TO authenticated;
GRANT ALL ON public.plan_repair_events TO service_role;

ALTER TABLE public.plan_repair_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own repair events"
  ON public.plan_repair_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own repair events"
  ON public.plan_repair_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all repair events"
  ON public.plan_repair_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_plan_repair_events_user_created ON public.plan_repair_events(user_id, created_at DESC);
CREATE INDEX idx_plan_repair_events_created ON public.plan_repair_events(created_at DESC);
