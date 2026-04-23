-- Heal existing composer drafts: clear legacy per-scene text_overlay text
-- for projects where the user has explicitly disabled (or never enabled) the
-- global text-overlays toggle. Without this, the renderer keeps burning in
-- storyboard-generated hooks/CTAs even though the toggle is OFF.
UPDATE public.composer_scenes cs
SET text_overlay = jsonb_set(
  COALESCE(cs.text_overlay, '{}'::jsonb),
  '{text}',
  '""'::jsonb
)
WHERE cs.project_id IN (
  SELECT id FROM public.composer_projects
  WHERE (assembly_config->>'textOverlaysEnabled') IS NULL
     OR (assembly_config->>'textOverlaysEnabled')::boolean = false
)
AND COALESCE(cs.text_overlay->>'text', '') <> '';