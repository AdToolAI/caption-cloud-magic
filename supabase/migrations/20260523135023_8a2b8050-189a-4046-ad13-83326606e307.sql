ALTER TABLE public.composer_scenes
ADD COLUMN IF NOT EXISTS dialog_takes JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.composer_scenes.dialog_takes IS
'Take-System A/B/C: per-line voiceover takes. Shape: { [lineKey]: { active: takeId, takes: [{ id, audioUrl, durationSec, voiceId, engine, voiceName, createdAt }] } }. lineKey = "<lineIndex>:<textHash>".';