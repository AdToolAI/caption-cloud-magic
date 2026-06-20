---
name: Lipsync Diagnostic Mode v142
description: Admin-only side-channel that dispatches one plate+audio to Sync.so in 5 ASD variants in parallel to empirically identify which mode actually moves lips on our plates
type: feature
---
## Why
After v140 fixed the Sync.so 400-errors, all passes return `sync_output_reencoded_passthrough_suspect` (NOOP). Live pipeline can't tell us *which* ASD strategy fails — every patch is guessing. This is the empirical ground-truth tool before any further v143+ patch.

## What
- Edge function `lipsync-diagnostic` accepts `{ plate_url, audio_url, coords?, bounding_boxes_url?, speaker_label?, source_scene_id?, source_pass_idx? }`
- Dispatches 5 parallel jobs:
  - A · `sync-3` + `auto_detect: true`
  - B · `sync-3` + flat `[x,y]` coordinates
  - C · `sync-3` + `bounding_boxes_url`
  - D · `sync-3` + `bounding_boxes` inline (static box, 60 frames)
  - E · `lipsync-2-pro` (different model — baseline sanity check)
- Polls all jobs for up to 8 min, writes outputs/errors to `lipsync_diagnostic_runs.variants` JSONB
- UI `/admin/lipsync-diag` shows the 5 output videos side-by-side; admin manually judges "Lippen bewegt? Y/N"
- Hard-cap: 5 runs per admin per 24h

## What it does NOT touch
- `compose-dialog-segments` v140
- `sync-so-webhook`
- `lipsync-watchdog` v141
- NOOP-escalation ladder v134

## Decision Matrix (post-run)
- E moves lips, A–D don't → switch live pipeline default back to `lipsync-2-pro` for dialog
- A moves lips, B/C/D don't → strip our ASD payloads, trust Sync.so auto_detect
- All 5 NOOP → plate-quality issue (Hailuo preclips too low-fi for sync-3) → escalate to Sync.so support + interim Hedra fallback

## Files
- `supabase/functions/lipsync-diagnostic/index.ts`
- `src/pages/admin/LipsyncDiagnostic.tsx`
- `supabase/migrations/<ts>__lipsync_diagnostic_runs.sql`
- Route: `/admin/lipsync-diag`
