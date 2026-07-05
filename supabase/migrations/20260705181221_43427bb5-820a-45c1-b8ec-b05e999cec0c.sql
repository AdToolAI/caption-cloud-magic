UPDATE public.composer_scenes s
   SET lock_reference_url = NULL,
       updated_at = now()
 WHERE lock_reference_url IS NOT NULL
   AND lock_reference_url LIKE '%/scene-anchors/%'
   AND position(s.id::text in lock_reference_url) = 0;