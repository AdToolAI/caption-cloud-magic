UPDATE public.plate_face_cache
SET expires_at = now() - interval '1 second'
WHERE detection_provider IS NULL
   OR detection_provider NOT IN ('aws_rekognition');