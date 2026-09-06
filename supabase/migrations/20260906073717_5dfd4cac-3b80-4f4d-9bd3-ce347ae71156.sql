ALTER TABLE public.video_enhance_runs
  ADD COLUMN IF NOT EXISTS requested_model_id text,
  ADD COLUMN IF NOT EXISTS delivery_strategy text,
  ADD COLUMN IF NOT EXISTS target_width integer,
  ADD COLUMN IF NOT EXISTS target_height integer,
  ADD COLUMN IF NOT EXISTS output_codec text,
  ADD COLUMN IF NOT EXISTS output_bitrate_kbps numeric,
  ADD COLUMN IF NOT EXISTS output_size_bytes bigint;