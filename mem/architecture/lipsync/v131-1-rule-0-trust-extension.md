---
name: v131.1 Rule 0 Trust Extension
description: Rule 0 (auto_detect primary) fires for preclip dispatches even when the server face-probe is unavailable or only the upstream face-center pipeline trust is available
type: feature
---

## Problem

v131 made `auto_detect: true` the primary ASD strategy — but only when
`preclipFaceCount === 1 && preclipAmbiguityRisk === "clean"`. In production
the server face-probe is intentionally disabled on Preclip assets
(`server_extract_disabled_use_client_canvas`), so `preclipFaceCount` is
almost always `null`. Rule 0 never fired and every preclip dispatch fell
back to the legacy `(coordinates, frame_number)` tuple — exactly the path
Replay-Lab proved reproduces `generation_unknown_error`.

## Fix (v131.1)

`_shared/asd-strategy.ts`: Rule 0 fires when ALL of these hold:

- `usePreclip === true`
- `retryVariant` not `coords-pro` / `preflight-snap` / bbox variants
- `preclipAmbiguityRisk !== "neighbor_inside_crop"`
- `preclipFaceCount !== > 1` (multi-face still blocks)
- AND at least one positive signal:
  - `preclipFaceCount === 1 && preclipAmbiguityRisk === "clean"` (v131 original)
  - `preclipFaceCount === null` (probe unavailable)
  - `preclipTrust === "verified"` (face-center pipeline succeeded)
  - `preclipTrust === "probe-confirmed"`

New `geometry.preclipTrust: "verified" | "probe-confirmed" | "unknown"`
input (default `"unknown"`, backward compatible).

`compose-dialog-segments/index.ts` passes
`preclipTrust = "verified"` whenever `pass.preclip_url` is set and
`pass.preclip_error` is null (upstream v69/v77/v116 success).

## Diagnostics

`strategy.diagnostics.rule` can now be:
- `rule_0_preclip_single_face_verified` (v131 original)
- `rule_0_preclip_verified` (preclipTrust=verified)
- `rule_0_preclip_probe_unavailable` (faceCount=null)
- `rule_0_preclip_probe_confirmed`

Top-level `syncso_dispatch_log.meta` now includes `asd_mode_chosen`,
`asd_rule_fired`, `preclip_trust` for cheap SQL filtering.

## Verification SQL

```sql
select created_at, sync_status,
  meta->>'asd_mode_chosen' as mode,
  meta->>'asd_rule_fired' as rule,
  meta->>'preclip_trust' as trust,
  coords, frame_number
from syncso_dispatch_log
where created_at > now() - interval '1 hour'
  and sync_source_kind = 'segments'
order by created_at desc;
```

After v131.1 deploy, new preclip dispatches must show:
- `coords` IS NULL (except for explicit coords-pro / multi-speaker retries)
- `mode = "single_face_auto"`
- `rule` starts with `rule_0_preclip_`
