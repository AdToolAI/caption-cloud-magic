SELECT id, clip_status, clip_url, clip_error, lip_sync_status, twoshot_stage, lip_sync_applied_at, pipeline_state, pipeline_detail, dialog_shots->>'status' AS dialog_status, dialog_shots->>'final_url' AS final_url
FROM public.composer_scenes
WHERE id = 'd7402a67-d10d-493d-8fe5-aefb91b6ccc9';