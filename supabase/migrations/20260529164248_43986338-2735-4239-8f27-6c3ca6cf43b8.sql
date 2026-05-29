
-- D.1: Face-Validation Cache + Tuning Hints (Sync.so reliability Stage D)
CREATE TABLE IF NOT EXISTS public.frame_face_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_url TEXT NOT NULL,
  frame_number INTEGER NOT NULL,
  fps INTEGER NOT NULL DEFAULT 24,
  result JSONB NOT NULL,
  -- result: { faceVisible, faceCount, faceBoxes:[{x,y,w,h,confidence}],
  --          coordsMatch:bool|null, suggestedFrameOffset:int|null, model:string }
  validator TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_url, frame_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frame_face_cache TO authenticated;
GRANT ALL ON public.frame_face_cache TO service_role;

ALTER TABLE public.frame_face_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frame_face_cache service-only read"
  ON public.frame_face_cache FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_frame_face_cache_lookup
  ON public.frame_face_cache (video_url, frame_number);
CREATE INDEX IF NOT EXISTS idx_frame_face_cache_expires
  ON public.frame_face_cache (expires_at);

-- D.4 placeholder: syncso_tuning_hints (auto-tuner reads latest row)
CREATE TABLE IF NOT EXISTS public.syncso_tuning_hints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL DEFAULT now(),
  best_lead_in_sec NUMERIC NOT NULL DEFAULT 0.25,
  best_min_dur_sec NUMERIC NOT NULL DEFAULT 3.0,
  preferred_source_kind TEXT NOT NULL DEFAULT 'preclip',
  avoid_mode TEXT,
  sample_count INTEGER NOT NULL DEFAULT 0,
  success_rate NUMERIC,
  raw_stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.syncso_tuning_hints TO authenticated;
GRANT ALL ON public.syncso_tuning_hints TO service_role;

ALTER TABLE public.syncso_tuning_hints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "syncso_tuning_hints admins read"
  ON public.syncso_tuning_hints FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_syncso_tuning_hints_created
  ON public.syncso_tuning_hints (created_at DESC);
