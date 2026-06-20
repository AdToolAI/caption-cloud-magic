
CREATE TABLE public.lipsync_diagnostic_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  plate_url TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  speaker_label TEXT,
  coords JSONB,
  bounding_boxes_url TEXT,
  source_scene_id UUID,
  source_pass_idx INT,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.lipsync_diagnostic_runs TO authenticated;
GRANT ALL ON public.lipsync_diagnostic_runs TO service_role;

ALTER TABLE public.lipsync_diagnostic_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read diagnostic runs"
  ON public.lipsync_diagnostic_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert diagnostic runs"
  ON public.lipsync_diagnostic_runs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND auth.uid() = created_by);

CREATE POLICY "Admins can update diagnostic runs"
  ON public.lipsync_diagnostic_runs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_lipsync_diag_runs_created_at ON public.lipsync_diagnostic_runs(created_at DESC);
CREATE INDEX idx_lipsync_diag_runs_created_by ON public.lipsync_diagnostic_runs(created_by);

CREATE TRIGGER trg_lipsync_diag_runs_updated_at
  BEFORE UPDATE ON public.lipsync_diagnostic_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
