---
name: v80 sync-so-webhook v41-v56 Mega-Branch Removed
description: Deleted 342 lines of dead v41-v56 single-call segments[] webhook handler in sync-so-webhook plus the orphan hasSegmentAudioInputCrop helper — late webhooks for legacy versions now fall through to the existing legacy_v4_ignored 200 short-circuit
type: architecture
---
# v80 — sync-so-webhook Legacy Branch Removed (June 9 2026)

**What:** Deleted the v41-v56 "Official Sync.so Multi-Speaker Segments (single-call)" handler in `supabase/functions/sync-so-webhook/index.ts` (lines 367-708, ~342 lines) plus the now-orphaned `hasSegmentAudioInputCrop()` helper (lines 148-156).

**Why:** v79 removed the only dispatcher that could produce `version∈{41..52,55,56} + engine='sync-official-segments*'` rows. No production code path can create such rows anymore. The webhook branch handled status/retry/refund for that dead dispatch shape and was unreachable.

**Late webhooks for historical rows:** Fall through to the existing `legacy_v4_ignored` short-circuit at the tail of the function (200 OK, no state mutation). Historical rows were already refunded by `lipsync-watchdog` per v70. `syncso_inflight_jobs` was empty at cleanup time (verified).

**File size:** 1459 → 1117 lines.

**Out of scope:** `_shared/` consolidation of `CLIP_COSTS` / `countDialogSpeakers` / Gemini-Face-Prompts is queued for v81. Pre-existing TS errors in `_shared/dialog-lock.ts` (missing generated RPC types for `try_acquire_dialog_lock` / `release_dialog_lock`) are unrelated and remain.
