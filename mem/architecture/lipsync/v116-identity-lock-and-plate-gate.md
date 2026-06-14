---
name: v116 Identity-Lock + Plate-Quality-Gate
description: Multi-speaker (N≥3) lipsync hardening — Plate-Quality-Gate blocks dispatch + refunds when plate-identity can't resolve every speaker; Face-Gate Self-Repair re-renders preclip with ×1.4/×1.8 crop expansion when faces=0; per-pass v116_diag persisted to syncso_dispatch_log for 5-min debugging
type: architecture
---

# v116 — Identity-Lock + Plate-Quality-Gate (June 2026)

Sticks to the v60 serial-chain with `sync-3` (Sync.so-doc-compliant for
static / multi-person plates). Fixes the actual root cause of 4-speaker
failures: cached identity-map drift vs. the rendered Hailuo plate.

## Fix B — Face-Gate Self-Repair (preclip)

`supabase/functions/_shared/pass-face-preclip.ts`
- New `cropExpansionFactor?: number` on `PassPreclipInput`. When > 1.0,
  multiplies the post-`computeFaceCrop` square `size` around the same
  center coords and re-clamps to source bounds (max 2.5×). Neighbor cap
  is intentionally bypassed for repair retries — including a sibling
  face is preferable to an empty crop; the downstream face-gate still
  enforces `count === 1`.

`supabase/functions/compose-dialog-segments/index.ts` (on-demand path
around line ~2492)
- Render+validate wrapped in a 3-step expansion ladder
  `[1.0, 1.4, 1.8]`. On `faces=0`, re-render with the next factor.
  `faces>1` does NOT retry (bigger crop wouldn't help). Worst case = 3
  Lambda renders / ~3 min for the rare failure case.
- Result persisted on the pass as `preclip_repair_attempts: number`.
- Batch path (around line ~2240) unchanged — when a batch-path pass
  fails face-gate, it lands without `preclip_url` and the on-demand
  repair loop fires when the pass's turn comes up. No code duplication.

## Fix C — Plate-Quality Gate for N≥3

`compose-dialog-segments` immediately after `resolvePlateFaceIdentities`
(around line ~1049).

Trigger:
- `!isAdvance && !isRetry && !isV41Retry`
- `speakers.length >= 3`
- `plateDims` available
- AND any of:
  - `plateIdentityMap` is null
  - `plateIdentityMap.faces.length < speakers.length`
  - `plateIdentityMap.resolvedCount < speakers.length`

Action:
- Refund the wallet debit (full `totalCost`).
- `dialog_shots.status='failed'`, `refunded=true`, `cost_credits=0`,
  `error='v116_plate_quality_gate:<reason>'`.
- `lip_sync_status='failed'`, `twoshot_stage='failed'`,
  `clip_status='pending'`, `clip_url=null`,
  `lip_sync_source_clip_url=null` — forces the user / Composer to
  re-render a plate where all N speakers are clearly framed.
- Clear bilingual user message in `clip_error` explaining what to do.
- `logSyncDispatch` row with `sync_status='PREFLIGHT_BLOCKED'`,
  `error_class='v116_plate_quality_gate'`.
- Returns HTTP 422 to the caller.

Rollback: set env `FORCE_SKIP_PLATE_GATE=true` on the edge function.

## Fix D — v116_diag persisted on every dispatch

`compose-dialog-segments` — the `DISPATCHED` `logSyncDispatch.meta` now
includes a `v116_diag` block per pass:

```
v116_diag: {
  asd_mode: "preclip_auto_detect" | "bbox_url" | "bbox_inline" | "coords_point" | "auto_detect",
  coords_sent: [cx, cy] | null,
  preclip_face_count: number | null,
  preclip_crop: { x, y, size, outputSize } | null,
  preclip_repair_attempts: number,
  coord_source: "plate-identity" | "plate-slot-fallback" | "anchor-rescale" | "heuristic" | ...,
  plate_identity_resolved: number,
  plate_identity_total: number,
  plate_dims: { width, height } | null,
}
```

Lets us debug a future failure from `syncso_dispatch_log` alone without
re-instrumenting: shows exactly what coords were sent, which face the
crop contained, how many repair attempts were needed, and whether
plate-identity actually resolved this speaker (vs. fallback drift).

## Out of scope (intentional)

- **Dispatch architecture unchanged.** v60 serial chain with `sync-3`
  stays. The Segments-API with one Sync.so call for N≥2 remains FROZEN
  (I.2 — v41/v54/v56 historical failures with `sync-3 + segments[]`
  reproducible `provider_unknown_error`; documented in
  `mem/architecture/lipsync/v58-multispeaker-multipass-fallback.md`).
- **Pricing, idempotent refunds, webhook chain, locks** — unchanged.
- **v115 preclip auto_detect for N=1** — unchanged.
- **v82 bbox-url-pro ladder for N≥2** — unchanged.

## Expected impact

- N=4 with proper plate (all 4 faces visible, no overlap, no edge cut):
  preclip ladder rescues any pass whose first crop missed; `v116_diag`
  shows `preclip_repair_attempts=1` instead of hard failure.
- N=4 with bad plate (Sora-style out-of-frame person): Plate-Quality
  Gate fires BEFORE Sync.so, refunds credits, forces re-render with
  clear instructions. €0 spent on un-syncable plate.
- N=1/2 — unchanged path, no regression risk (gate fires only on N≥3,
  repair fires only when face-gate already would have hard-failed).
