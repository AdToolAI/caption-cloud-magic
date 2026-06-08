---
name: Orphaned Lip-Sync Pending after Clip Fail
description: Cinematic-Sync clip failures must clear lip_sync_status/twoshot_stage when no master clip exists; watchdog resets pending+no-clip rows instead of letting UI spin forever.
type: feature
---

If a Cinematic-Sync master clip render fails before `clip_url` exists, the scene must not remain in `lip_sync_status='pending'`.

**Rule:** final clip-failure paths clear `lip_sync_status`, `twoshot_stage`, `lip_sync_source_clip_url`, and `dialog_shots` for Cinematic-Sync rows. The clip remains `clip_status='failed'` with a visible `clip_error`, so the user can regenerate the scene instead of seeing an endless Lip-Sync spinner.

**Watchdog safety-net:** `lipsync-watchdog` also scans `lip_sync_status='pending' + twoshot_stage IS NULL + clip_url IS NULL`; after the preflight TTL it resets the stale lip-sync state with `clip_error='watchdog: orphaned_lipsync_pending_no_clip'`. No Sync.so refund is needed because no provider job was dispatched.