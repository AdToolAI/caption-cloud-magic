---
name: v117 — Plate-Quality-Gate Soft-Fail + Identity-Resolver Repair
description: Fixes v116 false-positive blocks on perfectly fine 4-person plates by repairing the Gemini Vision identity prompt, adding a deterministic slot-order fallback, and narrowing the plate-quality gate to only block when face count is genuinely too low (not when identity assignment is shaky).
type: architecture
---

# v117 — Plate-Quality-Gate Soft + Identity Repair

## Problem (post v116)
v116 plate-quality-gate blocked dispatch whenever Gemini Vision failed to resolve all speakers (`resolved_faces=0/4`), even when the face *detector* found all 4 faces. Result: perfectly good plates were rejected, credits refunded, scenes reset. Toast `v116_plate_quality_gate`.

## Root cause (in `_shared/plate-face-identity.ts`)
1. **Confusing Gemini prompt** — said *"FIRST attachment is a video; look at frame at timestamp X.XXs"* but we sent a single still frame. Gemini returned empty/unparseable.
2. **Threshold 0.45 too strict** for 4 visually similar Hailuo-rendered people sharing lighting + wardrobe family.
3. **No fallback** when Gemini returned 0 assignments.
4. **Gate was binary** — blocked even when face count was correct.

## Fixes

### Fix A — Gemini prompt repair (`plate-face-identity.ts`)
- Prompt now correctly describes one still image (no "video" / "timestamp").
- `slotDescriptions` uses real pixel bboxes (`x=x1-x2, y=y1-y2`) instead of broken normalization.
- Confidence threshold **0.45 → 0.30**.
- For N≥3 faces, switch model **`google/gemini-2.5-flash` → `google/gemini-2.5-pro`** (~€0.005/scene, eliminates dominant failure mode).
- Greedy brace match takes the longest `{…}` chunk; better warn logs on parse failures.

### Fix B — Deterministic slot-order fallback (`plate-face-identity.ts`)
When Gemini returns **0 assignments** AND `plateFaces.length === characters.length`:
- Sort characters in incoming order (= script speaker order).
- Map 1:1 to left-to-right plate slots (`f.slot`).
- Mark `matchConfidence: 0.4`, `slotOrderFallback: true` on the returned map.
- Far safer than anchor-rescale drift; logs `gemini matched 0/N — v117 slot-order fallback applied`.

### Fix C — Soft gate (`compose-dialog-segments/index.ts` ~1051)
The gate now hard-blocks **only** when:
- `plateIdentityMap` is `null` (plate detection failed entirely), **OR**
- `detectedFaces < speakers.length` (physically missing faces — Sora out-of-frame bug).

When `detectedFaces >= speakers.length` but `resolvedFaces < speakers.length`, dispatch **proceeds** with a `v117_plate_quality_gate_SOFT_WARN` log line. The slot-order fallback from Fix B already provides the coords.

## What stays unchanged
- v60 serial sync-3 dispatch chain.
- v82 bbox-url-pro ladder, v115 single-face `auto_detect:true`, v106 doc-strict options.
- v116 Fix A (Live-Identity-Verify) and Fix B (Face-Gate Self-Repair) remain.
- Pricing, refunds, locks, webhook chain.

## Diagnostics
`syncso_dispatch_log.meta` continues to carry `detected_faces` + `resolved_faces`. New: blocked rows now use `error_class='v117_plate_quality_gate'` so v116/v117 are distinguishable in log queries.

## Verification
1. Reset scene with 4 visible speakers → `resolved_faces=4` (Gemini-Pro) or `resolved_faces=4` via slot-order fallback → no PREFLIGHT_BLOCKED.
2. Plate with only 3 visible (one person cut off) → gate still blocks with `plate_faces_missing(detected=3, expected=4)` and refunds.
3. N=1/2/3 regression unchanged (gate only fires for N≥3).

## Files
- `supabase/functions/_shared/plate-face-identity.ts`
- `supabase/functions/compose-dialog-segments/index.ts` (~1051–1160)
