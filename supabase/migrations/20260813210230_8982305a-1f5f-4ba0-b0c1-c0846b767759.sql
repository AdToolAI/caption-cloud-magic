ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS visual_source text DEFAULT NULL;

ALTER TABLE public.composer_scenes
  DROP CONSTRAINT IF EXISTS composer_scenes_visual_source_check;

ALTER TABLE public.composer_scenes
  ADD CONSTRAINT composer_scenes_visual_source_check
  CHECK (visual_source IS NULL OR visual_source IN (
    'auto',
    'character_anchor',
    'previous_final_frame',
    'uploaded_reference',
    'generated_still'
  ));

COMMENT ON COLUMN public.composer_scenes.visual_source IS
  'v430 Step 3: requested visual-input STRATEGY only (never an asset URL). NULL = legacy/unmigrated scene -> resolver keeps pre-v430 arbitration. Asset truth stays in reference_image_url / continuity_source_scene_id / upload fields.';