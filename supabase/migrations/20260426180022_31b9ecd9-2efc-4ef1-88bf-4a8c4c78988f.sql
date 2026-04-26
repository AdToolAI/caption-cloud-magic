-- Block R: Smart Reframe — store per-scene subject tracking metadata
-- Used by render-multi-format-batch + ComposedAdVideo to dynamically position
-- the crop window so the main subject stays in frame across aspect changes.

ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS subject_track JSONB;

COMMENT ON COLUMN public.composer_scenes.subject_track IS
  'Smart Reframe data: { source_aspect: "16:9", points: [{ t: seconds, x: 0..1, y: 0..1, conf: 0..1, label?: string }], analyzed_at: ISO, model: string }';

-- Project-level toggle so user preference is remembered across exports.
ALTER TABLE public.composer_projects
  ADD COLUMN IF NOT EXISTS smart_reframe_enabled BOOLEAN NOT NULL DEFAULT true;
