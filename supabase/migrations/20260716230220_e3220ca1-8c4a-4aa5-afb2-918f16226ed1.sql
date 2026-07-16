ALTER TABLE public.syncso_dispatch_log
  ADD COLUMN IF NOT EXISTS face_share_in_preclip numeric,
  ADD COLUMN IF NOT EXISTS mouth_center_offset_px numeric,
  ADD COLUMN IF NOT EXISTS noop_mouth_yavg numeric,
  ADD COLUMN IF NOT EXISTS detector_used text,
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_syncso_dispatch_log_noop
  ON public.syncso_dispatch_log (noop_mouth_yavg)
  WHERE noop_mouth_yavg IS NOT NULL;

COMMENT ON COLUMN public.syncso_dispatch_log.face_share_in_preclip
  IS 'v247: ratio of face bbox area to preclip crop area (target >= 0.40)';
COMMENT ON COLUMN public.syncso_dispatch_log.mouth_center_offset_px
  IS 'v247: pixel distance between mouth landmark and crop center';
COMMENT ON COLUMN public.syncso_dispatch_log.noop_mouth_yavg
  IS 'v247: YAVG-delta measured in the mouth band of the sync output (< 2.0 = suspected no-op)';
COMMENT ON COLUMN public.syncso_dispatch_log.detector_used
  IS 'v247: which face detector produced the coords (aws | mediapipe | both)';
COMMENT ON COLUMN public.syncso_dispatch_log.retry_count
  IS 'v247: how many times this dispatch was retried after a detected no-op';