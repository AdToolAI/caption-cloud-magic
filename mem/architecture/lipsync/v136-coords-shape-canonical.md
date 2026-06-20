---
name: Sync.so sync-3 coordinates shape canonical
description: ASD coordinates MUST be flat [x, y] (2 finite numbers); v136 regression sent nested [[x, y]] causing every dispatch to 400
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
Fixed in v139.1 on 2026-06-20.

## Guard rail

`compose-dialog-segments/index.ts` runs a **Pre-Dispatch Assertion**
right before `fetch(${SYNC_API_BASE}/generate)`: if `auto_detect === false`
and no bounding-box variant is set, `coordinates` is validated to be
`Array.isArray && length === 2 && every Number.isFinite`. Otherwise the
function returns `BAD_COORDS_SHAPE` immediately (no Sync.so call, no
credit charge) and logs the offending payload.

A successful pass also logs `coords_shape ok=[x,y]` so any future
regression is visible in 5 seconds of log search.

**Why:** Prevents another v136-style silent regression.
**How to apply:** Every new code path that sets
`syncOptions.active_speaker_detection.coordinates` must use flat
`[x, y]`. Pre-dispatch assertion enforces this; don't disable it.
