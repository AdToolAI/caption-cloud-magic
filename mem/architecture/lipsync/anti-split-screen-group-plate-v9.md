---
name: Anti-Split-Screen Group-Plate (Anchor Audit v9)
description: Group-plate prompt rewritten for N>=3 to prevent Hailuo/Nano-Banana-2 from rendering 4-up split-screen panels; negative prompt + plate-quality-gate split-screen detector enforce a single shared physical room
type: feature
---

# Anti-Split-Screen Group-Plate (v9)

## Problem
For N>=3 cast dialog scenes, the cinematic-sync master plate from
`compose-video-clips` (Nano Banana 2 anchor + Hailuo i2v) was being rendered
as a literal split-screen quad layout — every speaker isolated in their own
vertical panel with hard seams. The previous positive prompt phrased the
group composition as *"single horizontal line, equal screen share, clear gaps
between them, no overlap"*, which both image models started interpreting
literally rather than as ensemble framing guidance. Sync.so then either fails
with `generation_unknown_error` or the plate-quality-gate blocks because per-
speaker coordinates don't match the fixed-grid face positions.

## Fix (3 layers)

### 1. Positive prompt (n>=3 branch of `neutralTwoShotPrompt`)
Emphasise a single shared physical room captured in one continuous take with
overlapping depth planes and slight depth stagger. The phrases
`single horizontal line`, `equal screen share` and `clear gaps between them`
are removed.

### 2. Negative prompt (`CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE`)
Adds explicit blocks for: split screen, split-frame, multi-panel layout,
panel grid, photo grid, brady bunch grid, photo collage, composite of
separate portraits, isolated character cutouts, vertical divider lines,
visible seams between people, four-up grid, two-up grid, side-by-side
panels, individual portrait panels.

### 3. `ANCHOR_AUDIT_VERSION` bumped 8 -> 9
All previously pinned cinematic-sync anchor plates are invalidated and
re-composed with the new prompts on next render — no manual user action
needed.

### 4. Split-Screen-Detector in `compose-dialog-segments` plate-quality-gate
When N>=3 faces are detected, the gate now also computes:
- y-axis spread (max distance of any face center from mean) <= 5% of frame height
- consecutive x-gap spread <= 8% of mean gap
- face-box height spread <= 10% of mean height

If ALL three thresholds are hit, the layout is classified
`split_screen_layout(...)` and dispatch is blocked with a German user-facing
message + automatic credit refund via the existing v117 refund path.
Replaces the silent `generation_unknown_error` symptom with a clear
diagnosis.

## Files
- `supabase/functions/compose-video-clips/index.ts` (prompt, negative, audit version)
- `supabase/functions/compose-dialog-segments/index.ts` (split-screen detector)

## Invariants preserved
- FROZEN-INVARIANTS I.4: `LOCKED static camera` token and all
  framing-change keywords stay verbatim in
  `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE`.
- N-Slot Face-Map architecture (`syncso-n-slot-face-map`) unchanged —
  coordinates were correct, only the plate composition was wrong.
