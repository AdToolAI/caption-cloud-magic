---
name: Sync.so sync-3 coordinates shape canonical
description: ASD coordinates MUST leave compose-dialog-segments through the v140 canonical wire builder as flat [x, y] or a documented bbox/auto shape
type: constraint
---

# Sync.so `active_speaker_detection.coordinates` — Canonical Shape

When `auto_detect: false` and no `bounding_boxes` / `bounding_boxes_url`,
`coordinates` MUST be **a flat 2-element array of finite numbers**:

```ts
coordinates: [x, y]   // ✅ correct
```

NEVER nested:

```ts
coordinates: [[x, y]]      // ❌ Sync.so returns 400
                           //    "coordinates must contain at least 2 elements"
coordinates: [x]           // ❌ same error
coordinates: [x, y, z]     // ❌ rejected
```

## Why this memory exists

v136 (Preclip-Centered Coords, 2026-06-19) accidentally wrapped the
center-XY in an extra array. Every single dispatch returned 400 before
Sync.so even started rendering → UI showed "Lip-Sync abgebrochen".
v139.1 fixed one assignment, but later failures proved the pipeline still had
too many mutation points. v140.0 replaced the hotfix approach with a final
canonical wire builder immediately before the Sync.so fetch.

## Guard rail

`compose-dialog-segments/index.ts` now runs **v140 final canonicalization**
right before `fetch(${SYNC_API_BASE}/generate)`:

- `{ auto_detect: true }`
- `{ auto_detect: false, frame_number, coordinates: [x, y] }`
- `{ auto_detect: false, bounding_boxes_url }`
- `{ auto_detect: false, bounding_boxes }`

If a legacy nested `[[x, y]]` slips in, it is flattened at the final wire
boundary. If x/y are missing or non-finite, the function returns
`DISPATCH_BLOCKED_V140_CANONICAL_ASD` / `BAD_COORDS_SHAPE` locally (no Sync.so
call, no credit burn) and logs the offending payload.

A successful pass logs `v140_ASD_CANONICAL`, `coords_shape ok=[x,y]` when
coordinates are used, and `WIRE_PAYLOAD version=v140.0` so any future
regression is visible in 5 seconds of log search.

**Why:** Prevents another v136-style silent regression.
**How to apply:** Do not add post-payload ASD mutations. Every new branch must
feed its intent into the final v140 canonicalizer; the canonicalizer is the
only authority for what leaves the function.
