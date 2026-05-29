
CREATE TABLE IF NOT EXISTS public.syncso_dispatch_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  scene_id uuid,
  user_id uuid,
  engine text NOT NULL,                  -- 'cinematic-sync' | 'sync-segments' | 'twoshot' | other
  job_id text,
  turn_idx int,
  attempt int NOT NULL DEFAULT 0,
  mode text,                             -- 'auto' | 'coords'
  sync_source_kind text,                 -- 'preclip' | 'master' | 'segments'
  video_url text,
  audio_url text,
  video_bytes bigint,
  audio_bytes bigint,
  video_content_type text,
  audio_content_type text,
  audio_dur_sec numeric,
  audio_lead_in_sec numeric,
  audio_peak_dbfs numeric,
  audio_channels int,
  audio_sample_rate int,
  window_start_sec numeric,
  window_end_sec numeric,
  coords jsonb,
  frame_number int,
  preflight_repairs jsonb,                -- list of repairs applied
  http_status int,
  sync_status text,                       -- COMPLETED / FAILED / REJECTED / unknown
  error_class text,                       -- 'audio_too_short' | 'video_head_fail' | 'unknown_provider' | ...
  error_message text,
  meta jsonb
);

CREATE INDEX IF NOT EXISTS idx_syncso_dispatch_log_scene_created
  ON public.syncso_dispatch_log (scene_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_syncso_dispatch_log_error_class_created
  ON public.syncso_dispatch_log (error_class, created_at DESC)
  WHERE error_class IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_syncso_dispatch_log_job
  ON public.syncso_dispatch_log (job_id) WHERE job_id IS NOT NULL;

GRANT SELECT ON public.syncso_dispatch_log TO authenticated;
GRANT ALL ON public.syncso_dispatch_log TO service_role;

ALTER TABLE public.syncso_dispatch_log ENABLE ROW LEVEL SECURITY;

-- Admins can read (uses existing has_role security-definer fn).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'has_role' AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "Admins read syncso_dispatch_log"
        ON public.syncso_dispatch_log
        FOR SELECT
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin'::app_role));
    $POL$;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
