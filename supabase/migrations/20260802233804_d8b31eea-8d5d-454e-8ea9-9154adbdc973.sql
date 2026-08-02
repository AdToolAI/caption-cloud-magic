SELECT id, clip_status, clip_url, clip_error, lip_sync_status, twoshot_stage, lip_sync_applied_at, pipeline_state, pipeline_detail, dialog_shots->>'status' AS dialog_status, dialog_shots->>'final_url' AS final_url
FROM public.composer_scenes
WHERE id = 'd7402a67-d10d-493d-8fe5-aefb91b6ccc9';

SELECT position('terminal_revive_blocked' in pg_get_functiondef(p.oid)) AS blocked_guard_position,
       position('v400_july_baseline_observe_only' in pg_get_functiondef(p.oid)) AS observe_only_position
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'composer_scene_state_guard';