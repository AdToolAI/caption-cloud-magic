-- v427A1 — additive run contract + pipeline job ledger. No behaviour change.

CREATE TABLE public.composer_scene_runs (
  run_id UUID NOT NULL PRIMARY KEY,
  scene_id UUID NOT NULL REFERENCES public.composer_scenes(id) ON DELETE CASCADE,
  run_contract_version INTEGER NOT NULL DEFAULT 427,
  status TEXT NOT NULL DEFAULT 'preflight',
  requested_duration_ms INTEGER,
  required_duration_ms INTEGER,
  effective_duration_ms INTEGER,
  effective_duration_frames INTEGER,
  billable_duration_seconds NUMERIC,
  duration_policy_version TEXT,
  quoted_cost_euros NUMERIC,
  reservation_id UUID,
  audio_plan_id TEXT,
  audio_asset_id TEXT,
  audio_asset_hash TEXT,
  measured_audio_duration_ms INTEGER,
  dialog_content_hash TEXT,
  voice_configuration_hash TEXT,
  contract_frozen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_composer_scene_runs_scene ON public.composer_scene_runs(scene_id, created_at DESC);

GRANT SELECT ON public.composer_scene_runs TO authenticated;
GRANT ALL ON public.composer_scene_runs TO service_role;

ALTER TABLE public.composer_scene_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view runs of accessible scenes"
ON public.composer_scene_runs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.composer_scenes s
  WHERE s.id = composer_scene_runs.scene_id
    AND public.can_access_composer_project(s.project_id, auth.uid())
));

CREATE TABLE public.composer_pipeline_jobs (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES public.composer_scenes(id) ON DELETE CASCADE,
  run_id UUID NOT NULL,
  run_contract_version INTEGER NOT NULL DEFAULT 427,
  stage TEXT NOT NULL,
  segment_id UUID,
  speaker_id UUID,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  provider TEXT,
  external_job_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload_hash TEXT,
  callback_claim_token UUID,
  callback_claimed_at TIMESTAMPTZ,
  callback_claim_expires_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT composer_pipeline_jobs_stage_check CHECK (stage IN (
    'base_video','audio_plan','tts','preclip','sync_segment','audio_mux','final_render'
  )),
  CONSTRAINT composer_pipeline_jobs_status_check CHECK (status IN (
    'pending','dispatching','dispatched','running','callback_processing',
    'succeeded','failed','cancelled','stale','dispatch_uncertain'
  )),
  CONSTRAINT composer_pipeline_jobs_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT composer_pipeline_jobs_identity_unique
    UNIQUE NULLS NOT DISTINCT (scene_id, run_id, stage, segment_id, attempt_no)
);

CREATE INDEX idx_composer_pipeline_jobs_run ON public.composer_pipeline_jobs(run_id, stage);
CREATE INDEX idx_composer_pipeline_jobs_scene ON public.composer_pipeline_jobs(scene_id, created_at DESC);
CREATE INDEX idx_composer_pipeline_jobs_external ON public.composer_pipeline_jobs(external_job_id) WHERE external_job_id IS NOT NULL;

GRANT SELECT ON public.composer_pipeline_jobs TO authenticated;
GRANT ALL ON public.composer_pipeline_jobs TO service_role;

ALTER TABLE public.composer_pipeline_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pipeline jobs of accessible scenes"
ON public.composer_pipeline_jobs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.composer_scenes s
  WHERE s.id = composer_pipeline_jobs.scene_id
    AND public.can_access_composer_project(s.project_id, auth.uid())
));

CREATE TRIGGER update_composer_scene_runs_updated_at
BEFORE UPDATE ON public.composer_scene_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_composer_pipeline_jobs_updated_at
BEFORE UPDATE ON public.composer_pipeline_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Additive mirror columns on the scene (UI reads only; runs stay authoritative).
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS run_contract_version INTEGER,
  ADD COLUMN IF NOT EXISTS requested_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS required_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS effective_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS effective_duration_frames INTEGER,
  ADD COLUMN IF NOT EXISTS billable_duration_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS duration_run_id UUID,
  ADD COLUMN IF NOT EXISTS duration_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS quoted_cost_euros NUMERIC,
  ADD COLUMN IF NOT EXISTS reservation_id UUID,
  ADD COLUMN IF NOT EXISTS audio_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS audio_asset_id TEXT,
  ADD COLUMN IF NOT EXISTS audio_asset_hash TEXT,
  ADD COLUMN IF NOT EXISTS measured_audio_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS dialog_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS voice_configuration_hash TEXT,
  ADD COLUMN IF NOT EXISTS base_clip_status TEXT,
  ADD COLUMN IF NOT EXISTS base_clip_url TEXT;