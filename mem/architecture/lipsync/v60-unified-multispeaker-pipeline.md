---
name: v60 Unified Multi-Speaker Lip-Sync Pipeline
description: As of June 2026 every dialog scene with N≥2 speakers uses the same per-speaker chained Sync.so pipeline from the very first dispatch. The v56 `sync-3 + segments[]` single-call path is no longer attempted (kept as dead code with `force_v56` debug flag only). The 2-speaker parallel fan-out is removed — all multi-speaker scenes dispatch Pass 0 only and the webhook chains Pass 1..N-1 serially via `pendingIdxs[0]`. Sticky markers (`force_multipass`, `multipass_fallback_attempted`) are auto-set on the first state write for every N≥2 so any later retry stays on the chained path. 1-speaker scenes are unchanged (single v5 pass).
type: architecture
---

## Why

The v56 `sync-3 + segments[]` first attempt failed reproducibly with
`provider_unknown_error` for 3-4 speaker scenes; the v58 fallback then
recovered via the per-speaker chained pipeline. For 2-speaker scenes we
kept the legacy v5 parallel fan-out — same dispatch-race symptom v33
removed for N≥3 (two pass-0 jobs within ms, the later one logged as
`job ... not in passes[]`). Result: 2-speaker scenes had a worse failure
profile than 3-4 speaker scenes despite using a "simpler" code path.

v60 collapses everything into one canonical path.

## What changed

1. `compose-dialog-segments/index.ts`
   - `useV41Official` is hard-pinned `false` for `speakers.length >= 2`.
     The `force_v56` body flag is a single-speaker debug-only hook; no
     production code sets it.
   - `carryForceMultipass` / `carryMultipassAttempted` are now `true`
     whenever `speakers.length >= 2`, so the sticky markers are set on
     the very first state write and survive every subsequent retry.
   - `fanOutAllowed` is hardcoded `false`. The serial-chain log
     (`SERIAL mode (N speakers, v60 unified)`) now fires for
     `passes.length > 1` instead of `> 2`.

2. `sync-so-webhook/index.ts`
   - The v58 multipass-fallback branch (only triggered by `isV56Manual`)
     is effectively unreachable in v60 production traffic. It is kept as
     defense-in-depth: if any future change accidentally re-enables v56
     for multi-speaker, the fallback still refunds and re-dispatches
     correctly.

3. FROZEN-INVARIANTS.md
   - I.1 generalised from "≥3 speakers" to "≥2 speakers".
   - I.2 rewritten — `useV41Official` MUST stay false for multi-speaker.
   - New I.9 — no parallel fan-out for any speaker count.

## Out of scope

- Pricing unchanged (`ceil(durSec) × 9 × N_passes`).
- Idempotent refund path (v23 server-owned state) unchanged.
- `MAX_SPEAKERS = 4` (FROZEN I.6) unchanged.
- `compose-video-clips`, `compose-scene-anchor`, audio-mux Lambda
  (`render-sync-segments-audio-mux`) unchanged.

## Verification

- 2-speaker scene: edge logs show `SERIAL mode (2 speakers, v60 unified)`
  and exactly 2 sequential Sync.so jobs. No v56 dispatch, no
  `provider_unknown_error` on the first try, no
  `job ... not in passes[]` race.
- 3-4 speaker scene: same serial-chain log, no v56 first attempt.
- 1-speaker scene: single v5 pass, no multipass markers, behaviour
  bit-identical to pre-v60.

## Tradeoff

2-speaker scenes lose the (~8-12s) latency benefit of parallel
dispatch — acceptable given the failure rate the parallel path was
producing in production.
