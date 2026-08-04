CREATE TABLE public.launch_milestones (
  key TEXT NOT NULL PRIMARY KEY,
  label TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  achieved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.launch_milestones TO authenticated;
GRANT ALL ON public.launch_milestones TO service_role;

ALTER TABLE public.launch_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view launch milestones"
ON public.launch_milestones
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));