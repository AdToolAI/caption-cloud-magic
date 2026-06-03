UPDATE public.composer_scenes
SET
  lip_sync_status = 'pending',
  twoshot_stage = NULL,
  clip_error = NULL,
  dialog_shots = NULL,
  lip_sync_applied_at = NULL,
  updated_at = now()
WHERE id = '24998e98-b53f-4b52-aed6-95ce26ee7ffa';

DELETE FROM public.syncso_inflight_jobs
WHERE scene_id = '24998e98-b53f-4b52-aed6-95ce26ee7ffa';

UPDATE public.provider_circuit_state
SET
  state = 'closed',
  fail_count = 0,
  opened_at = NULL,
  half_open_at = NULL,
  last_error_class = NULL,
  updated_at = now()
WHERE provider = 'sync.so';