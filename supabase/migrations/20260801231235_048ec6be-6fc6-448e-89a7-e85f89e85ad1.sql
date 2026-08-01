DELETE FROM public.video_creations
WHERE metadata->>'scene_id' = '6bf4e815-b4b0-4364-af16-9aafa9054aad'
  AND output_url LIKE '%/ai-videos/composer/%';

INSERT INTO public.video_creations (user_id, output_url, status, credits_used, metadata)
SELECT p.user_id,
       s.clip_url,
       'completed',
       0,
       jsonb_build_object(
         'source','motion-studio-clip',
         'canonical', true,
         'dialog_final', true,
         'project_id', s.project_id,
         'project_name', p.title,
         'scene_id', s.id::text,
         'scene_order', s.order_index,
         'model', s.clip_source,
         'duration_seconds', s.duration_seconds,
         'superseded', false
       )
FROM public.composer_scenes s
JOIN public.composer_projects p ON p.id = s.project_id
WHERE s.id = '6bf4e815-b4b0-4364-af16-9aafa9054aad'
  AND s.clip_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.video_creations v WHERE v.output_url = s.clip_url);