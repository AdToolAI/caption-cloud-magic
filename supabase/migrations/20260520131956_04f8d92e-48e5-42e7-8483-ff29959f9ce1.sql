-- Reset pending composer scenes that still carry the old "Featuring NAME: <other-NAME description>"
-- prompt leak. After the compose-video-clips / compose-scene-anchor fix, regenerating these
-- scenes will produce a clean anchor with exactly the speakers from the dialog script.
-- We only touch scenes that have NOT been successfully rendered yet (clip_url IS NULL).
WITH targets AS (
  SELECT id
  FROM public.composer_scenes
  WHERE dialog_script IS NOT NULL
    AND trim(dialog_script) <> ''
    AND clip_url IS NULL
    AND ai_prompt ILIKE '%[Dialog]%'
)
UPDATE public.composer_scenes s
SET
  reference_image_url = NULL,
  clip_status = 'pending',
  clip_error = NULL,
  audio_plan = CASE
    WHEN audio_plan ? 'twoshot'
      THEN audio_plan - 'twoshot'
    ELSE audio_plan
  END,
  updated_at = now()
FROM targets t
WHERE s.id = t.id;

-- Drop any cached anchors for these scenes so the next compose call rebuilds
-- from scratch with the new v10 cache version and clean speaker list.
DELETE FROM public.scene_anchor_cache
WHERE scene_id IN (
  SELECT id FROM public.composer_scenes
  WHERE dialog_script IS NOT NULL
    AND trim(dialog_script) <> ''
    AND clip_url IS NULL
);