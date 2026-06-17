# v129.5 — Provider Input Experiment Track

**Status:** shipped 2026-06-17
**Bucket addressed:** `terminal_provider_unknown_no_retry` (Sync.so returns `provider_unknown_error` with empty `error_code` on syntactically valid inputs)

## Purpose

Pure lab/forensic tooling. v129.4 already terminalises affected scenes cleanly (no watchdog hang, idempotent refund, no sibling pass churn). v129.5 adds the means to actually understand *why* Sync.so rejects the input — without ever touching the live pipeline.

## Hard isolation guarantees

- `composer_scenes`, `dialog_shots`, `syncso_dispatch_log`, wallet, refund system, watchdog are **never** read-write by v129.5 endpoints — only read.
- Replay payload `webhookUrl` always points to `syncso-replay-webhook`. The production `sync-so-webhook` is never invoked.
- All replay outcomes land exclusively in `syncso_replay_log` (append-only, admin-readable, service-role writable).
- No live-pipeline behaviour change. v129.4 invariants remain in force.

## Files

| File | Purpose |
|---|---|
| `supabase/functions/syncso-support-bundle/index.ts` | Generate a JSON support bundle for a failed pass (provider truth via `GET /v2/generate/:id`, asset sha256, light ffprobe, sanitized reproducer payload). |
| `supabase/functions/syncso-replay/index.ts` | Admin-only re-dispatch endpoint with override presets. Rate-limited (5/pass/hour), reason + confirm required, model whitelist enforced. |
| `supabase/functions/syncso-replay-webhook/index.ts` | Separate webhook target for replay jobs only. Writes only to `syncso_replay_log`. |
| `supabase/migrations/*_syncso_replay_log.sql` | Append-only audit table, RLS-protected. |
| `src/components/admin/SyncsoForensicsSheet.tsx` | Admin UI tabbed into a Sheet, opened via the "Forensik" button on failed Composer scenes. |

## Override Presets

| # | Preset | Effect | Diagnostic value |
|---|---|---|---|
| 1 | `exact` | Sends the original payload byte-near (minus production webhook). | Is `provider_unknown_error` reproducible outside live pipeline? |
| 2 | `omit_sync_mode` | Strips `sync_mode` entirely. | Is `cut_off` the trigger? |
| 3 | `loop` | Sets `sync_mode: "loop"`. | **Timing warning** — output duration follows audio, not video. |
| 4 | `bboxes` | Replaces `frame_number+coordinates` with a constant per-frame `bounding_boxes` array derived from v129.1 plate coords. | Is `frame_number+coordinates` the trigger? Does sync-3 work at all on this input? |
| 5 | `auto_detect` | `{ active_speaker_detection: { auto_detect: true } }`. | **Unsafe for production** on multi-speaker scenes — lab only. |
| 6 | `lipsync_2_pro` | `model: "lipsync-2-pro"`. | Is the model itself the trigger? |
| 7 | `lipsync_2` | `model: "lipsync-2"`. | Same, with the older model. |

Only models `sync-3`, `lipsync-2-pro`, `lipsync-2` are accepted (the `sync-2` name from earlier drafts is not a documented model and is rejected with HTTP 400).

## Diagnostic workflow

1. **Bundle**. Open the failed scene → Forensik → "Bundle erzeugen". Confirm the bundle's `provider_truth.get_generation` either contains an `error_code` (then we have the bug class) or `error_code_missing: true` (the Sync.so-support befund — attach the bundle to a Sync.so ticket).
2. **Reproduce**. Run preset `exact`. If the same `provider_unknown_error` returns, the failure is reproducible outside the live pipeline — production webhooks, watchdog, and credit refund had nothing to do with it.
3. **Bisect**. Run presets in order 2 → 3 → 4 → 5 → 6 → 7, **one at a time**, recording the outcome row in `syncso_replay_log`. There is no auto-loop and no "try all".
4. **Conclude**. The first preset that returns `completed` localises the trigger. Open a separate plan v129.6 for a production fix (or attach the bundle to a Sync.so support ticket).

## Acceptance / hard invariants

- A replay run leaves the affected scene's `composer_scenes` row byte-identical (verify via select).
- No new rows appear in `syncso_dispatch_log` during a replay.
- The wallet balance of the scene owner is unchanged.
- `lipsync-watchdog` does not wake for the replay (its terminal-state no-op guard from v129.4 covers this anyway).
- The replay's `webhookUrl` in any captured log/dispatch payload is **never** the production `sync-so-webhook` URL.

## Out of scope

- No automatic retry, model fallback, or pre-dispatch heuristic in the live pipeline.
- No changes to `compose-dialog-segments`, `sync-so-webhook`, `lipsync-watchdog`, `computeFaceCrop`.
- No new crop forensics (the v129.4 canary already showed `risk: clean`, so this is orthogonal to v129.2).
