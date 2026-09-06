ALTER TABLE public.ai_video_generations
  ADD COLUMN IF NOT EXISTS parity_model_id TEXT,
  ADD COLUMN IF NOT EXISTS parity_api_route TEXT,
  ADD COLUMN IF NOT EXISTS parity_region TEXT,
  ADD COLUMN IF NOT EXISTS parity_mode TEXT,
  ADD COLUMN IF NOT EXISTS parity_resolution_label TEXT,
  ADD COLUMN IF NOT EXISTS requested_width INTEGER,
  ADD COLUMN IF NOT EXISTS requested_height INTEGER,
  ADD COLUMN IF NOT EXISTS measured_fps NUMERIC,
  ADD COLUMN IF NOT EXISTS measured_duration_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS measured_container TEXT,
  ADD COLUMN IF NOT EXISTS measured_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS measured_bitrate_bps BIGINT,
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.video_model_tier_parity
  ADD COLUMN IF NOT EXISTS api_route TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 't2v';

ALTER TABLE public.video_model_tier_parity
  DROP CONSTRAINT IF EXISTS video_model_tier_parity_pkey;

ALTER TABLE public.video_model_tier_parity
  ADD CONSTRAINT video_model_tier_parity_pkey
  PRIMARY KEY (model_id, api_route, region, mode, resolution_label);