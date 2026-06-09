---
name: v77 Plate-Native Face Targeting
description: Multi-speaker lip-sync MUST resolve per-character coords/bbox on the rendered video plate (resolvePlateFaceIdentities) — anchor faceMap is fallback only. Soft-pass for "all anchor identity-matched" removed; preclip face-count gate added.
type: architecture
---

# Why
Anchor (Nano Banana 2 still) and rendered Hailuo plate drift 5–15 % in framing. Rescaling anchor face coords onto the plate routinely puts the Sync.so target on the WRONG face → user sees "Lip-Sync hat keinen einzigen Avatar getroffen" even though the run reports `done`.

# Rule
For every 2+ speaker dialog scene, `compose-dialog-segments` calls `resolvePlateFaceIdentities(plateUrl, characters)` BEFORE building per-pass coords. The returned `characterId → {center, bbox}` (plate-pixel space) overrides anchor coords AND drives the single-face preclip crop. Anchor coords stay as the fallback when plate detection genuinely fails.

# Gates
- 3+ speaker scenes: `allIdentityMatched` soft-pass is gone. The strict per-frame `validate-frame-face` check always runs.
- Each rendered preclip is validated for face-count == 1 before Sync.so dispatch. Wrong count → preclip is discarded, pipeline falls back to full-plate dispatch with the plate-native coords (still better than wrong anchor coords).

# Files
- `supabase/functions/_shared/plate-face-identity.ts` (new)
- `supabase/functions/_shared/plate-face-detect.ts` (consumer)
- `supabase/functions/compose-dialog-segments/index.ts` (override + face-gate + soft-pass removal)

# Refund
Wrong-face runs that completed against drifted anchor coords are eligible for a manual one-shot refund migration, idempotent via `dialog_shots.refunded`. See `20260609_reset_wrong_lipsync_scene_94c42a63…`.
