---
name: v79 Dead v41/v54/v56 Segments Block Removed
description: 499 lines of the debug-only single-call Sync.so segments[] dispatch deleted from compose-dialog-segments — was gated behind force_v56 body flag that no production code ever set
type: architecture
---
# v79 — Dead Segments Block Removed (June 9 2026)

**What:** Deleted lines 929-1443 (≈499 lines) of `compose-dialog-segments/index.ts`. The block dispatched a single Sync.so generation with top-level `segments[]` (v41/v54/v56 payload shape), gated behind `body.force_v56 === true && speakers.length === 1` (`debugForceV56` → `useV41Official`). No production caller ever set `force_v56` — every dispatch fell through to the v60 chained per-speaker pipeline.

**Why:** Sync.so's `sync-3 + segments[]` path returns the opaque `An unknown error occurred.` on real plates regardless of ASD shape (see v58/v59 probes). The chained per-speaker pipeline (v69 unified for ALL N≥1) is the only payload shape Sync.so accepts reliably.

**Removed identifiers:** `debugForceV56`, `useV41Official`, `v41PrevState`, `v47Cost`, `v41Inputs`, `v41SpeakerRefs`, `v41Segments`, `v41Webhook`, `v41Payload`, `v41Resp`, `v41Data`, `v41JobId`, `v41State`, `v41NowIso`, `v41RetryCount`, `v50BoxDiag`, `V50_MODEL`, `V55_ENGINE`, `ASD_MODE`, `AUDIO_INPUT_MODE`, `FPS_HINT_V46`, `stateForcesMultipass`, `stateMultipassAttempted`, `segmentsWithBox`, `segmentsAutoFallback`.

**Kept for backwards compat (no-op):** `body.retry_v41`, `body.force_multipass`, `body.retry_no_asd` — older `sync-so-webhook` re-arms can still send these flags; they now silently fall through to the chained dispatcher. The `version IN (41..52, 55, 56)` defensive `already_running` guard in `isStaleFailedState` / re-entrancy is kept so legacy in-flight rows from before v79 don't get double-dispatched.

**File size:** 2874 → 2375 lines.

**Out of scope for v79:** sync-so-webhook v41-v56 mega-branch cleanup, lipsync-watchdog legacy schema checks, `_shared/` consolidation of `CLIP_COSTS` / `countDialogSpeakers` / Gemini-Face-Prompts. Those are queued for v80.
