CREATE TABLE public.syncso_replay_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pass_id TEXT,
  scene_id UUID,
  original_provider_job_id TEXT,
  replay_provider_job_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  override_preset TEXT NOT NULL,
  overrides_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_payload_hash TEXT,
  video_sha256 TEXT,
  audio_sha256 TEXT,
  provider_status TEXT,
  provider_error TEXT,
  provider_error_code TEXT,
  response_json JSONB,
  output_url TEXT,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  reason TEXT,
  notes TEXT
);

CREATE INDEX idx_syncso_replay_log_pass_id ON public.syncso_replay_log(pass_id);
CREATE INDEX idx_syncso_replay_log_scene_id ON public.syncso_replay_log(scene_id);
CREATE INDEX idx_syncso_replay_log_replay_job ON public.syncso_replay_log(replay_provider_job_id);
CREATE INDEX idx_syncso_replay_log_created_at ON public.syncso_replay_log(created_at DESC);

GRANT SELECT ON public.syncso_replay_log TO authenticated;
GRANT ALL ON public.syncso_replay_log TO service_role;

ALTER TABLE public.syncso_replay_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view replay log"
  ON public.syncso_replay_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages replay log"
  ON public.syncso_replay_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);