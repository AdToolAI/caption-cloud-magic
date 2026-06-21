ALTER TABLE public.plate_face_cache
  ADD COLUMN IF NOT EXISTS detection_provider TEXT,
  ADD COLUMN IF NOT EXISTS mouth_landmarks JSONB;

COMMENT ON COLUMN public.plate_face_cache.detection_provider IS 'v155: which detector produced these faces — aws_rekognition | gemini-2.5-flash | gemini-2.5-pro-strict | mediapipe (legacy)';
COMMENT ON COLUMN public.plate_face_cache.mouth_landmarks IS 'v155: optional per-face mouth landmark in plate pixel space, populated when detection_provider=aws_rekognition. Shape: [{slot:int, mouth:[x,y]}].';