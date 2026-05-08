ALTER TABLE public.composer_scenes
  ADD COLUMN IF NOT EXISTS engine_override TEXT NOT NULL DEFAULT 'auto'
  CHECK (engine_override IN ('auto', 'heygen', 'broll', 'sync-polish'));

COMMENT ON COLUMN public.composer_scenes.engine_override IS
  'Per-scene engine override for the Composer render pipeline. auto = let recommendEngineForScene() decide; heygen = force HeyGen Photo-Avatar lip-sync; broll = force Hailuo/etc. without lip-sync; sync-polish = Hailuo + Sync.so polish pass.';