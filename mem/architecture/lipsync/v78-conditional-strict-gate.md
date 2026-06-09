---
name: v78 Conditional Strict Face-Gate
description: Strict per-coordinate face validation only runs when plate identity actually resolved at least one speaker; otherwise fall back to soft-pass with face-repair
type: feature
---
# v78 — Conditional Strict Face-Gate (June 9 2026)

**Problem (v77 regression):** For 3+ speaker scenes, the strict per-coordinate `validateFrameFace` check ran unconditionally whenever `plateDims` was probed. When `resolvePlateFaceIdentities` failed (e.g. Hailuo MP4 without moov-atom → frame extract crashes → `plate_identity=off`), the coords used were anchor-rescale derived and drift 5–15% from real plate faces. The strict gate then hard-rejected every frame → "Lip-Sync hat keinen Avatar getroffen".

**Fix (`compose-dialog-segments` v78):**
```ts
const havePlateIdentity = !!plateIdentityMap && plateIdentityMap.resolvedCount > 0;
const strictTargetCheck = speakers.length >= 3 && !!plateDims && havePlateIdentity;
```
- When plate identity unavailable for ≥3 speakers → log a `v78 soft-pass` warning and fall back to legacy face-repair behaviour (slot-based bbox repair from sorted-left-to-right faces).
- When plate identity resolved ≥1 speaker → strict gate runs as before; coords sit on real plate faces and trivially pass.

**Invariant:** never hard-block a 3+ speaker scene purely because we couldn't probe the plate. Soft-pass is safer than refund-storm.

**Related:** supersedes the strict rule in `v77-plate-native-face-targeting.md`.
