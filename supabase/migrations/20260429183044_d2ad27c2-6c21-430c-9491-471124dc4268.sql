-- Brief: Video defaults
ALTER TABLE public.autopilot_briefs
  ADD COLUMN IF NOT EXISTS video_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_provider text NOT NULL DEFAULT 'hailuo-standard',
  ADD COLUMN IF NOT EXISTS video_duration_sec integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS video_aspect_ratio text NOT NULL DEFAULT '9:16';

-- Queue: video render tracking
ALTER TABLE public.autopilot_queue
  ADD COLUMN IF NOT EXISTS video_provider text,
  ADD COLUMN IF NOT EXISTS video_prediction_id text,
  ADD COLUMN IF NOT EXISTS video_status text,
  ADD COLUMN IF NOT EXISTS video_error text,
  ADD COLUMN IF NOT EXISTS video_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS video_completed_at timestamptz;

-- Add generating_video status
ALTER TABLE public.autopilot_queue DROP CONSTRAINT IF EXISTS autopilot_queue_status_check;
ALTER TABLE public.autopilot_queue ADD CONSTRAINT autopilot_queue_status_check
  CHECK (status = ANY (ARRAY['draft','generating','generating_video','qa_review','scheduled','posted','blocked','failed','skipped']));

-- Index for poller
CREATE INDEX IF NOT EXISTS idx_autopilot_queue_video_pending
  ON public.autopilot_queue (video_started_at)
  WHERE status = 'generating_video' AND video_prediction_id IS NOT NULL;

-- Video jobs audit table
CREATE TABLE IF NOT EXISTS public.autopilot_video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES public.autopilot_queue(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text,
  prompt text NOT NULL,
  duration_sec integer NOT NULL,
  aspect_ratio text NOT NULL,
  prediction_id text,
  status text NOT NULL DEFAULT 'queued',
  cost_credits integer NOT NULL DEFAULT 0,
  output_url text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autopilot_video_jobs_user ON public.autopilot_video_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autopilot_video_jobs_status ON public.autopilot_video_jobs (status) WHERE status IN ('queued','processing');
CREATE INDEX IF NOT EXISTS idx_autopilot_video_jobs_slot ON public.autopilot_video_jobs (slot_id);

ALTER TABLE public.autopilot_video_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own video jobs"
  ON public.autopilot_video_jobs FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_autopilot_video_jobs_updated_at
  BEFORE UPDATE ON public.autopilot_video_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();