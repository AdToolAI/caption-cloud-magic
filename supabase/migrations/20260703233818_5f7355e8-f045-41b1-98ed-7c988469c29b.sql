
UPDATE public.composer_scenes
SET
  clip_status = 'failed',
  clip_error = 'legacy_talking_head_route_removed: Composer-Szenen laufen jetzt ausschließlich über Cinematic-Sync (HappyHorse/Hailuo → Sync.so). Bitte über "Sauber neu starten" erneut rendern.',
  clip_url = NULL,
  lip_sync_status = NULL,
  twoshot_stage = NULL,
  dialog_shots = NULL,
  lip_sync_source_clip_url = NULL,
  updated_at = now()
WHERE
  clip_url ILIKE '%/talking-head-renders/%'
  AND (
    engine_override IN ('cinematic-sync', 'sync-segments')
    OR lip_sync_with_voiceover = true
    OR dialog_mode = true
  );
