-- Reset the broken 3-speaker scene so the user can re-render with the new
-- plate-dim-aware coords + no-auto-fallback logic.
UPDATE public.composer_scenes
SET
  lip_sync_status = NULL,
  twoshot_stage = NULL,
  clip_status = 'pending',
  clip_url = NULL,
  clip_error = NULL,
  dialog_shots = NULL,
  updated_at = now()
WHERE id = '643efb56-b687-45e1-9a40-4c8279af14b5';