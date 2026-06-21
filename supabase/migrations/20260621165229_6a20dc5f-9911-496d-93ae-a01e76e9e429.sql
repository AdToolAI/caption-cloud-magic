UPDATE plate_face_cache
SET expires_at = now() - interval '1 second'
WHERE expires_at > now()
  AND (
    detection_provider IS NULL
    OR detection_provider LIKE 'gemini-2.5-flash%'
    OR detection_provider = 'gemini-2.5-pro-strict'
    OR detector LIKE 'gemini-2.5-flash%'
    OR detector = 'gemini-2.5-pro-strict'
  );