-- v102 Step A: reset scene f67d51ba so it re-dispatches with the new
-- diagnostic build (preclip_duration_sec persisted, v102_probe written to
-- syncso_dispatch_log.meta on every DISPATCHED row).
UPDATE public.composer_scenes
SET
  lip_sync_status = 'pending',
  twoshot_stage = NULL,
  clip_error = NULL,
  updated_at = now()
WHERE id = 'f67d51ba-4465-47eb-84e5-09e1dafd617e';

-- Clear stale inflight slot if any so the per-user concurrency gate doesn't
-- block the fresh dispatch.
DELETE FROM public.syncso_inflight_jobs
WHERE scene_id = 'f67d51ba-4465-47eb-84e5-09e1dafd617e';