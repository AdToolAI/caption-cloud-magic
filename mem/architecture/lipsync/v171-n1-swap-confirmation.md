---
name: v171 N=1 Swap-Confirmation
description: Gemini Flash false-positive "swap" verdicts for N=1 anchors are re-checked with Gemini 2.5 Pro; multi-cast lone mismatches without reason=swap are downgraded to soft-warn
type: feature
---

# v171 — N=1 Swap-Confirmation

## Problem
`auditAnchorIdentity` (`_shared/identity-audit.ts`) trusted a single Gemini 2.5 Flash `faceMatch: "mismatch"` verdict and hard-blocked the render with `anchor_identity_swap_detected`. On N=1 single-cast scenes (e.g. Samuel as founder), Flash routinely flags identical persons under different lighting/pose as "mismatch", producing false-positive swaps even though the rendered person is clearly the cast member.

## Fix (additive, audit-only — pipeline untouched)

1. **Prompt hardening**: explicit "mismatch" gate — same sex + similar age + plausible same person under different lighting/angle/expression/wardrobe MUST return "match". Doubt → "uncertain", never "mismatch".
2. **N=1 confirmation**: when Flash flags swap for N=1, a second pass uses `google/gemini-2.5-pro`. Only when BOTH agree do we return `ok:false, reason:"swap"`. Otherwise soft-pass with `v171.decision="softpass_ok"`.
3. **Multi-cast low-confidence gate**: a single mismatched ref without `reason==="swap"` from the model is downgraded to soft-warn (no hard block).

All decisions are logged + persisted to `audio_plan.twoshot.anchor_face_audit.v171`.

## Untouched
`compose-scene-anchor`, `compose-dialog-segments`, Sync.so payload contract, Hailuo/HappyHorse plate pipeline, `compose-video-clips` hard-abort branch, frontend.

## Files
- `supabase/functions/_shared/identity-audit.ts`
