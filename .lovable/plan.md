# Read-only RCA: Gen14 lip-sync preflight stall

## Scope
Investigate scene `67b392b1-aca1-489d-b773-d604deb22623`, run `6c3a617b-0873-4f42-b34a-e86409b11b33`, generation 14 without changing source, deploying, calling providers, triggering generation, or writing production data.

## Confirmed observations
- Current source claims pass 0 by writing `status='rendering_preflight'` plus both preflight timestamps in `compose-dialog-segments` before tracking/preclip work.
- The production row remains at that claim timestamp, with no `sync_segment` ledger row and no face-track row.
- Function logs show repeated later invocations rebuilding face/geometry context, then skipping the claimed pass as already active.
- The watchdog scans `pending + master_clip`, explicitly excludes `rendering_preflight` from normal advance, and delegates it to V459 zombie recovery.
- Face-cache writes are produced by independent pre-claim validation invocations and therefore do not prove the claimed pass is advancing.

## Audit steps
1. Produce an exact source trace from the claim write through face tracking, preclip rendering, immutable pinning, ledger acquisition, and provider dispatch.
2. Inventory every awaited operation in that interval, including explicit timeout/retry budgets and catch behavior.
3. Reconcile current scene state, ledger rows, lock rows, face-track rows, face-cache timestamps, function request logs, and detailed function logs.
4. Verify watchdog eligibility, zombie threshold/recovery budget, lock behavior, and terminal aggregation path for `rendering_preflight`.
5. Identify the exact success transition and exact timeout/failure transition expected by current source.
6. Separate proven facts from inference, determine whether Gen14 is failed, live, or stuck, and assess whether the defect is related to V514/V514-P1.
7. Return a GO/NO-GO only for the smallest scoped fix supported by the evidence.

## Technical constraints
- Read-only queries and log retrieval only.
- No source edits, migrations, deployment, provider/API generation calls, or production writes.
- Final report will include exact file/function/line areas and explicitly mark any unavailable evidence.
