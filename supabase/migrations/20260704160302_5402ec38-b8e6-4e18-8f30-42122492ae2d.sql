-- Backfill: Legacy-Zeilen die durch die HeyGen→cinematic-sync-Migration blind
-- auf lip-sync geflaggt wurden, wieder auf `auto` (B-Roll) zurücksetzen — nur
-- solche die nachweislich nie echten Sync.so-Lauf hatten und keinen expliziten
-- User-Opt-in-Toggle tragen. Aktive Runs (dialog_shots != null) und bereits
-- fertig synchronisierte Szenen (lip_sync_applied_at != null) bleiben unberührt.

UPDATE public.composer_scenes
SET
  engine_override = 'auto',
  lip_sync_with_voiceover = false,
  lip_sync_status = NULL,
  twoshot_stage = NULL,
  dialog_shots = NULL,
  updated_at = now()
WHERE engine_override IN ('cinematic-sync', 'sync-segments')
  AND lip_sync_with_voiceover IS DISTINCT FROM true
  AND dialog_mode IS DISTINCT FROM true
  AND lip_sync_applied_at IS NULL
  AND (dialog_shots IS NULL OR dialog_shots = '{}'::jsonb);