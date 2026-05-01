-- Status Incidents Table
CREATE TABLE public.status_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  affected_components TEXT[] NOT NULL DEFAULT '{}',
  severity TEXT NOT NULL CHECK (severity IN ('degraded','partial_outage','major_outage')),
  status TEXT NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating','identified','monitoring','resolved')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_incidents_started_at ON public.status_incidents(started_at DESC);
CREATE INDEX idx_status_incidents_resolved_at ON public.status_incidents(resolved_at);

ALTER TABLE public.status_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read incidents"
ON public.status_incidents FOR SELECT
USING (true);

CREATE POLICY "Admins can manage incidents"
ON public.status_incidents FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_status_incidents_updated_at
BEFORE UPDATE ON public.status_incidents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();