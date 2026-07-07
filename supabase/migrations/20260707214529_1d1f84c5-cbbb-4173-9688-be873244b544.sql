
-- v202: Cast & World ID-Registry — scene_assets column on composer_scenes
ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS scene_assets jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS composer_scenes_scene_assets_gin
  ON public.composer_scenes USING GIN (scene_assets jsonb_path_ops);

-- Backfill helper: aggregate character/location/style refs from legacy columns.
WITH char_refs AS (
  SELECT s.id AS scene_id,
         jsonb_agg(
           jsonb_build_object(
             'type', 'character',
             'id', (cs->>'characterId'),
             'role', NULLIF(cs->>'role', ''),
             'displayName', COALESCE(NULLIF(cs->>'displayName',''), NULLIF(cs->>'name',''))
           )
         ) AS refs
  FROM public.composer_scenes s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.character_shots, '[]'::jsonb)) cs
  WHERE (cs->>'characterId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (s.scene_assets IS NULL OR s.scene_assets = '[]'::jsonb)
  GROUP BY s.id
),
loc_refs AS (
  SELECT s.id AS scene_id,
         jsonb_build_array(
           jsonb_build_object(
             'type', 'location',
             'id', (s.mentioned_location_ids)[1]::text,
             'role', 'backdrop'
           )
         ) AS refs
  FROM public.composer_scenes s
  WHERE s.mentioned_location_ids IS NOT NULL
    AND array_length(s.mentioned_location_ids, 1) >= 1
    AND (s.scene_assets IS NULL OR s.scene_assets = '[]'::jsonb)
),
style_refs AS (
  SELECT s.id AS scene_id,
         jsonb_build_array(
           jsonb_build_object(
             'type', 'style',
             'id', s.applied_style_preset_id::text
           )
         ) AS refs
  FROM public.composer_scenes s
  WHERE s.applied_style_preset_id IS NOT NULL
    AND (s.scene_assets IS NULL OR s.scene_assets = '[]'::jsonb)
),
merged AS (
  SELECT scene_id, refs FROM char_refs
  UNION ALL
  SELECT scene_id, refs FROM loc_refs
  UNION ALL
  SELECT scene_id, refs FROM style_refs
),
agg AS (
  SELECT scene_id,
         (
           SELECT jsonb_agg(elem)
           FROM (
             SELECT jsonb_array_elements(refs) AS elem FROM merged m2 WHERE m2.scene_id = m1.scene_id
           ) x
         ) AS combined
  FROM merged m1
  GROUP BY scene_id
)
UPDATE public.composer_scenes s
SET scene_assets = agg.combined
FROM agg
WHERE s.id = agg.scene_id
  AND agg.combined IS NOT NULL
  AND (s.scene_assets IS NULL OR s.scene_assets = '[]'::jsonb);

-- Feature flag: default OFF (gate hard-fail behavior until verified).
INSERT INTO public.system_config (key, value, description)
VALUES (
  'composer.feature.scene_assets_required',
  'false'::jsonb,
  'v202: when true, compose-video-clips hard-fails if scene_assets cannot be resolved to real Cast&World IDs.'
)
ON CONFLICT (key) DO NOTHING;
