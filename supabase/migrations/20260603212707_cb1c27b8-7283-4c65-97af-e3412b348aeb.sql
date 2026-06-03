
-- Reset two stuck cinematic-sync scenes after v25 fan-out rollout.
-- Idempotent refund is handled by failLipSync() in subsequent provider runs;
-- here we just free inflight slots and reset state so the auto-trigger can
-- pick them up fresh.
DELETE FROM public.syncso_inflight_jobs
WHERE scene_id IN (
  '4a56d6a1-2f0b-4ef1-8bef-20fa0477ff68',
  '85ecc55a-5c58-4a5b-9ff2-6aca547cd111'
);

UPDATE public.composer_scenes
SET lip_sync_status = 'pending',
    lip_sync_applied_at = NULL,
    twoshot_stage = 'master_clip',
    dialog_shots = NULL,
    clip_error = NULL,
    replicate_prediction_id = NULL,
    updated_at = now()
WHERE id IN (
  '4a56d6a1-2f0b-4ef1-8bef-20fa0477ff68',
  '85ecc55a-5c58-4a5b-9ff2-6aca547cd111'
);
