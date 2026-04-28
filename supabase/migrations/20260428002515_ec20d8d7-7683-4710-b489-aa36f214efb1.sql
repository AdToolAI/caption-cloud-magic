-- Fix Auto-Director Composer projects that got stuck on unsupported engines.
-- 1) Rewrite scenes still planned with 'ai-sora' (not implemented in compose-video-clips) to 'ai-hailuo'.
-- 2) Reset failed/pending Kling/Sora scenes from the last 2 hours so the user can re-generate.
-- 3) Unblock affected projects whose status is 'generating' but no scene is actually running.

UPDATE public.composer_scenes
SET clip_source = 'ai-hailuo',
    clip_status = CASE WHEN clip_status IN ('failed') THEN 'pending' ELSE clip_status END,
    updated_at = now()
WHERE clip_source = 'ai-sora'
  AND created_at > now() - interval '24 hours';

UPDATE public.composer_scenes
SET clip_status = 'pending',
    replicate_prediction_id = NULL,
    updated_at = now()
WHERE clip_status = 'failed'
  AND clip_source = 'ai-kling'
  AND updated_at > now() - interval '6 hours';

UPDATE public.composer_projects p
SET status = 'storyboard', updated_at = now()
WHERE p.status = 'generating'
  AND p.updated_at < now() - interval '15 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM public.composer_scenes s
    WHERE s.project_id = p.id AND s.clip_status = 'generating'
  );