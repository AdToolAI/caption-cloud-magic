-- v19 recovery: reset the recently "completed" cinematic-sync dialog scenes
-- where the visible clip showed no lipsync + uncanny body motion. Cancelling
-- here lets the user press "Lip-Sync neu rendern" once and the new v19
-- pipeline (re-hosted Sync.so output + constrained dialog plate prompt) will
-- regenerate the master plate and the per-turn lipsync from scratch.
UPDATE public.composer_scenes
SET
  lip_sync_status = 'canceled',
  twoshot_stage = NULL,
  dialog_shots = NULL,
  lip_sync_applied_at = NULL,
  lip_sync_source_clip_url = NULL,
  clip_url = NULL,
  clip_status = 'pending',
  reference_image_url = NULL,
  clip_error = 'v19_reset_for_lipsync_pipeline_upgrade',
  updated_at = now()
WHERE id IN (
  '699e85ff-0933-4606-99ae-6a207f1d517c',
  '6936d98e-efe6-4f44-a4e5-f87a0c30cea8'
);

DELETE FROM public.syncso_inflight_jobs
WHERE scene_id IN (
  '699e85ff-0933-4606-99ae-6a207f1d517c',
  '6936d98e-efe6-4f44-a4e5-f87a0c30cea8'
);