---
name: v131.3 — coords-pro is the fresh-default label and no longer forces strict coordinates on preclip
description: Why `isCoordsProRetry` drops `coords-pro` from the strict-coord forcing set, so Rule 0 (auto_detect:true) can actually fire on the preclip path
type: feature
---

# v131.3 — Disarm `coords-pro` on the Preclip Path

## Root cause (2026-06-19)

`compose-dialog-segments/index.ts` sets `freshDefaultVariant = "coords-pro"` for every brand-new preclip dispatch (incl. "Sauber neu starten"). The asd-strategy module treated `coords-pro` as an **explicit coord-forcing retry** via `isCoordsProRetry()`, which blocked Rule 0 and forced Rule 3 (`preclip_coord_strict`).

Result: every fresh dispatch sent `{ auto_detect:false, frame_number, coordinates:[x,y] }` to Sync.so on a single-face preclip, which the provider reproducibly rejects with `generation_unknown_error` (confirmed on scenes `793aef02-…`, `b3e17a9d-…` outbound `[360,363] @ frame 50`).

`v131.2` made Rule 0 "unconditional on preclip" but the gate `!isCoordsProRetry(retryVariant)` still excluded `coords-pro` from eligibility — so v131.2 silently did not apply to the production default path.

## Fix

`supabase/functions/_shared/asd-strategy.ts` → `isCoordsProRetry()` now returns true ONLY for explicit admin/forced-coord retries:

- `sync3-coords`
- `coords-pro-lp2pro`
- `preflight-snap`

The label `coords-pro` survives as the legacy fresh-default variant (writing it elsewhere would require touching many call sites) but no longer carries strict-coord semantics. With v131.3 the dispatched payload on a normal fresh preclip is:

```json
{ "options": { "active_speaker_detection": { "auto_detect": true }, "sync_mode": "cut_off" } }
```

…and `syncso_dispatch_log.meta.asd_strategy.rule` starts with `rule_0_…`.

## Scope of change

- `supabase/functions/_shared/asd-strategy.ts` — drop `"coords-pro"` from `isCoordsProRetry`.
- `supabase/functions/_shared/asd-strategy.test.ts` — 23 tests pass; existing coords-pro-driven tests updated to use `sync3-coords` (the true forced-coord variant).
- Plate-path legacy branch in `compose-dialog-segments/index.ts` (line ~3685) is untouched — `coords-pro` still works there because that code path bypasses `buildAsdStrategy` entirely and is only reached for non-preclip (`!usePassPreclip`) dispatches.

## Post-deploy smoke check (SQL)

```sql
select dispatch_at,
       meta->'asd_strategy'->>'rule' as rule,
       outbound_payload->'options'->'active_speaker_detection' as asd,
       retry_variant
from public.syncso_dispatch_log
order by dispatch_at desc
limit 10;
```

Expected after first new dispatch on a multi-speaker preclip:

- `rule` begins with `rule_0_…`
- `asd = { "auto_detect": true }`
- `coordinates` is NOT present
- `retry_variant` is `coords-pro` (legacy label) on fresh starts, or one of `sync3-coords` / `coords-pro-lp2pro` only on explicit admin retries.

## Related

- v131.1 (`mem://architecture/lipsync/v131-1-rule-0-trust-extension.md`)
- v131.2 (`mem://architecture/lipsync/v131-2-rule-0-unconditional-on-preclip.md`)
- sync-3 strict options policy (`mem://architecture/lipsync/sync-3-doc-strict-options-v106`)
