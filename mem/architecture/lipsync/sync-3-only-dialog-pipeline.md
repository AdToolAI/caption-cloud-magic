---
name: Dialog pipeline sync-3-only
description: compose-dialog-segments always dispatches on sync-3; lipsync-2 / lipsync-2-pro fallbacks are disabled for the dialog pipeline (v129.29, user-directive 2026-06-19)
type: constraint
---

`supabase/functions/compose-dialog-segments/index.ts` hardcodes `payloadModel = SYNC3_MODEL`. The previous `_force_lipsync2_clean_preclip_retry_v12928` flag and `LIPSYNC_FALLBACK_MODEL` / `LIPSYNC_MODEL` selection branches were removed.

Retry differentiation happens only via ASD shape on sync-3:
1. `auto_detect: true` (default for clean single-face preclips, including the `coords-pro` retry path).
2. Explicit `frame_number + coordinates` (only when `coordsProRetry && coordsProInBounds` and NOT preclipUnambiguous — kept as diagnostic B path).
3. Future: `bounding_boxes_url`, then expanded-crop + auto_detect.

**Why:** User directive — only sync-3 for dialog lip-sync. lipsync-2 had introduced model-swap drift and was never the desired path. Webhook may still set retry variants `auto-standard` / `coords-pro-lp2pro`; compose ignores the model implication and stays on sync-3.

**Do not re-introduce** any lipsync-2 / lipsync-2-pro dispatch from compose-dialog-segments without explicit user approval.
