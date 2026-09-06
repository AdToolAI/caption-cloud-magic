ALTER TABLE public.ai_video_generations
  ADD COLUMN IF NOT EXISTS measured_width INTEGER,
  ADD COLUMN IF NOT EXISTS measured_height INTEGER,
  ADD COLUMN IF NOT EXISTS target_width INTEGER,
  ADD COLUMN IF NOT EXISTS target_height INTEGER,
  ADD COLUMN IF NOT EXISTS output_verdict TEXT;

CREATE TABLE IF NOT EXISTS public.video_model_tier_parity (
  model_id TEXT NOT NULL,
  resolution_label TEXT NOT NULL,
  parity_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  consecutive_mismatches INTEGER NOT NULL DEFAULT 0,
  tier_disabled BOOLEAN NOT NULL DEFAULT false,
  last_verdict TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (model_id, resolution_label)
);

GRANT SELECT ON public.video_model_tier_parity TO authenticated;
GRANT ALL ON public.video_model_tier_parity TO service_role;

ALTER TABLE public.video_model_tier_parity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read model parity state" ON public.video_model_tier_parity;
CREATE POLICY "Signed-in users can read model parity state"
ON public.video_model_tier_parity
FOR SELECT
TO authenticated
USING (true);