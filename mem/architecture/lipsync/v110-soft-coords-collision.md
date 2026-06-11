---
name: v110 Soft Coords-Close (No Pre-Dispatch Block)
description: Removes v107 hard-fail when two speaker face coords on the master plate are closer than max(120 px, plate.width × 0.08). Close coords are no longer a pre-dispatch blocker — they emit a `v110_coords_close` warning and per-pass preclip dispatch decides success on its own. The remaining N-1 speakers must not be killed by one close-face pair.
type: architecture
---

# Why
v107 (`mem://architecture/lipsync/v107-hard-preclip-enforcement.md`) added a pre-dispatch guard in `compose-dialog-segments` that refunded credits and marked the WHOLE scene failed when any two speaker face anchors on the master plate were closer than `max(120 px, plate.width × 0.08)`. DB-verified failure: scene `f2a58546-692a-4ef5-a690-ba93b513abf5` (4 speakers, Δ 76 px between Kailee/Matthew) returned `v107_coords_collision:face_coords_collision_76px_min_120px_pair_2_3` and killed all 4 lipsync passes including the 2 well-spaced ones.

That guard was correct for the legacy v69 single-face-preclip pipeline (sibling-cap collapsed close faces into one ~80 px square that Sync.so could not lip-sync). With **v109 native-resolution preclip** (`mem://architecture/lipsync/v109` — `pass-face-preclip.ts` no longer upscales to 512×512) a smaller preclip is no longer destructive. Sync.so either lip-syncs the cropped face cleanly, or returns a closed-mouth no-op for that single pass — never a full scene failure.

# Rule
- The collision check in `compose-dialog-segments/index.ts` (the fresh-dispatch branch, ~line 1179) is **warning only**. It logs `v110_coords_close speakers=… minDist=… threshold=… pair=…` and proceeds.
- No refund, no `lip_sync_status=failed`, no `clip_error` is written from this measurement.
- The v107 hard-fail on full-plate dispatch without a valid preclip (~line 2616) is unchanged — it still protects against Sync.so multi-face confusion on the raw plate.

# Files
- `supabase/functions/compose-dialog-segments/index.ts` — v107 pre-guard block replaced with the v110 warning-only branch.

# Verification
- Edge logs on a 4-speaker close-face scene must show `v110_coords_close` (warn) and then normal per-pass preclip dispatch.
- DB: `lip_sync_status` must not become `failed` solely due to close coords; partial successes (e.g. 3/4 passes) remain accepted as before.
- Well-spaced scenes: no `v110_coords_close` log, identical happy path to v107.
