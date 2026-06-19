---
name: ASD Rule 0 unconditional on preclip (v131.2)
description: Per-speaker preclip is single-face by construction → auto_detect:true is unconditional unless explicit retry or neighbor_inside_crop ambiguity
type: architecture
---

# v131.2 — Rule 0 unconditional on preclip

## Problem
v131.1's `hasPositiveTrust` gate was too tight in production. On scene
`793aef02-…` (2026-06-19), a 4-speaker hook with `FACE_GATE_PROBE_UNAVAILABLE`
and `preclipTrust='unknown'` fell through Rule 0 into Rule 3
(`preclip_coord_strict`) and was dispatched to sync-3 with
`{auto_detect:false, coordinates:[360,363], frame_number:52}`. Sync.so
responded with `generation_unknown_error` (the exact failure mode Rule 0
exists to avoid).

## Fix
The per-speaker preclip is a single-face square crop by construction
(v69 face-center pipeline). Multi-speaker scenes still produce one face
per preclip. Therefore Rule 0 fires **unconditionally** for every preclip
dispatch except:

- Explicit retry variants `coords-pro`, `coords-pro-box`, `coords-pro-lp2pro`,
  `sync3-coords`, `bbox-url-pro`, `preflight-snap`
- `preclipAmbiguityRisk === "neighbor_inside_crop"` (sibling actually
  intruded into the crop)
- Probe confirmed `preclipFaceCount > 1`

`hasPositiveTrust`, `preclipTrust`, and `preclipFaceCount===null` checks
are removed from the gate (still surfaced as diagnostic labels).

## Diagnostics
`syncso_dispatch_log.meta` now always carries top-level:
- `asd_mode_chosen`
- `asd_rule_fired` (falls back to mode when strategy has no `rule` key)
- `preclip_trust`

## Verification
- `supabase/functions/_shared/asd-strategy.test.ts`: 10 tests pass.
- Re-running scene 793aef02-… must show `asd_rule_fired` starts with
  `rule_0_`, outbound ASD = `{auto_detect:true}`, `coords` and
  `frame_number` NULL.

## Files
- `supabase/functions/_shared/asd-strategy.ts` (Rule 0 gate)
- `supabase/functions/_shared/asd-strategy.test.ts` (+2 tests)
- `supabase/functions/compose-dialog-segments/index.ts` (diagnostic fallback)
