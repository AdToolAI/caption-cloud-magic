UPDATE public.composer_scenes
SET lip_sync_status = 'pending',
    dialog_shots = NULL,
    twoshot_stage = NULL,
    lip_sync_applied_at = NULL,
    clip_status = 'pending'
WHERE id IN (
  'e57ef6dd-31a4-4b9d-9b49-5894d64bea7d',
  '3da688ef-e467-45e7-a6a7-503c1432270a'
);

DELETE FROM public.scene_anchor_cache
WHERE scene_id IN (
  'e57ef6dd-31a4-4b9d-9b49-5894d64bea7d',
  '3da688ef-e467-45e7-a6a7-503c1432270a'
);