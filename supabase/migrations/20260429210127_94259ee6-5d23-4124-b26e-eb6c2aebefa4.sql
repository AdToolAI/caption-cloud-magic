-- Muted patterns table
CREATE TABLE public.qa_muted_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_regex TEXT NOT NULL,
  reason TEXT,
  mission_pattern TEXT,
  severity_when_matched TEXT NOT NULL DEFAULT 'low' CHECK (severity_when_matched IN ('critical','high','medium','low','info','ignore')),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_muted_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view muted patterns"
  ON public.qa_muted_patterns FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert muted patterns"
  ON public.qa_muted_patterns FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete muted patterns"
  ON public.qa_muted_patterns FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Add resolved_by to bug reports
ALTER TABLE public.qa_bug_reports
  ADD COLUMN IF NOT EXISTS resolved_by UUID;

-- Allow admins to update bug reports (status, resolved_at, resolved_by)
DROP POLICY IF EXISTS "Admins can update qa bug reports" ON public.qa_bug_reports;
CREATE POLICY "Admins can update qa bug reports"
  ON public.qa_bug_reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed common noise patterns so the next run is already cleaner.
INSERT INTO public.qa_muted_patterns (pattern_regex, reason, severity_when_matched) VALUES
  ('X-Frame-Options may only be set via an HTTP header', 'Cosmetic browser warning — header is set in _headers', 'ignore'),
  ('ResizeObserver loop', 'Known harmless browser quirk', 'ignore'),
  ('Loading chunk \\d+ failed', 'Vite chunk reload during deploy — transient', 'low'),
  ('ChunkLoadError', 'Transient deploy artifact', 'low'),
  ('Failed to load resource: the server responded with a status of 401', 'Auth token missing for un-authenticated routes', 'low');