---
name: v85 Gate-Decision Telemetry (Mini-Phase 2.5)
description: compose-dialog-segments emits a single-line `[v82-gate]` log on every fresh multi-speaker dispatch, recording why bbox-url-pro was or was not picked (plateDims, plateIdentityMap.resolvedCount, preclip presence). retry_variant was already written into syncso_dispatch_log.meta, so this closes the observability gap without any schema or behavior change.
type: architecture
---

# v85 — Gate-decision telemetry (June 2026, Mini-Phase 2.5)

## What changed
`supabase/functions/compose-dialog-segments/index.ts` — right after the
v82 fresh-dispatch gate (~L1526-1560) we emit:

```
[v82-gate] scene=<id> pass=<n> speakers=<N> plateDims=<bool> resolved=<count> preclip=<bool> → variant=<picked> (<reason>)
```

`<reason>` is one of:
- `picked-bbox-url-pro` — gate passed
- `fallback-no-plateDims`
- `fallback-identity-unresolved(resolved=N)`
- `fallback-preclip-present`
- `fallback-unknown` (defensive, should not occur)

Emitted ONLY on fresh dispatch (retries inherit the previous variant)
and ONLY for N >= 2 (single-speaker scenes never qualify).

## Why
After v82 deployed, `syncso_dispatch_log` showed zero `bbox-url-pro`
rows over 48 h. We could not tell whether the gate was simply never
hit, or whether it was always failing one of the four sub-conditions.
This single log line makes the decision tree observable in real time
without re-reading the source.

`retry_variant` is already persisted in `syncso_dispatch_log.meta`
(via the existing dispatch logger), so the empirical fail-rate per
variant can be queried with:

```sql
SELECT meta->>'retry_variant' AS rv, sync_status, COUNT(*)
FROM syncso_dispatch_log
WHERE engine = 'sync-segments' AND created_at > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

## Files
- edited `supabase/functions/compose-dialog-segments/index.ts`
