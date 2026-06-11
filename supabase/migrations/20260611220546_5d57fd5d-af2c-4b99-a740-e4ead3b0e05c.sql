-- v110: reset scene blocked by v107 coords-collision pre-guard (already refunded)
UPDATE composer_scenes
SET lip_sync_status = NULL,
    twoshot_stage = NULL,
    clip_error = NULL,
    dialog_shots = NULL,
    lip_sync_applied_at = NULL,
    updated_at = now()
WHERE id = 'f2a58546-692a-4ef5-a690-ba93b513abf5';

DELETE FROM syncso_inflight_jobs WHERE scene_id = 'f2a58546-692a-4ef5-a690-ba93b513abf5';
DELETE FROM dialog_dispatch_locks WHERE scene_id = 'f2a58546-692a-4ef5-a690-ba93b513abf5';
