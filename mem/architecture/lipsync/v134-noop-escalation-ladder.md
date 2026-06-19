---
name: v134 NOOP Escalation Ladder (sync-3 only)
description: Deterministic 2-step NOOP-recovery ladder in sync-so-webhook varies ASD shape (bbox-url-pro → coords-pro-box) instead of redispatching identical input; hard-fail with refund + needs_clip_rerender after step 2. Replaces v129.26 single-shot coords-pro retry that produced the silent "Speaker 2 mouth not opening" bug.
type: architecture
---

# v134 — NOOP Escalation Ladder

## Problem (pre-v134, verified scene `6b4fda29-…`)

`sync-so-webhook` v129.26 escalated NOOP-suspect passes by setting `retry_variant = "coords-pro"` and re-dispatching. But it re-dispatched the SAME coords, SAME frame_number, SAME model, SAME ASD mode. Sync.so saw the identical input vector → produced the identical NOOP output. After exactly one such pointless retry, the pass dropped into `PASS_DONE_SUSPECT` (status=done, sync_noop_suspect=true) and the final Lambda mux happily glued the silent NOOP clip into the scene. Result: Speaker 2 visibly does not open his mouth while every other speaker is correctly lipsynced.

Forensic trace from `syncso_dispatch_log` for that scene's Speaker 2 turn:
```
DISPATCH coords-pro [564,137] frame 101   →   NOOP (sync_output_unchanged)
ESCALATE coords-pro [564,137] frame 101   →   NOOP again              ← Game Over
PASS_DONE_SUSPECT → muxed → silent mouth in final video
```

Compounding factor: `coord_refresh_terminal_blocked` (v128) refused to update coords when the freshly computed plate-identity coord was available, on the (correct-for-failed-passes, wrong-for-active-NOOP-retries) basis that the pass is "terminal".

## Solution

### 1. Real ladder, two rungs, sync-3 only

```
Step 0 (1st NOOP)  → variant `bbox-url-pro`   (per-frame bounding_boxes_url JSON, sync-3 conform)
Step 1 (2nd NOOP)  → variant `coords-pro-box` (bounding-box ASD on plate coords, sync-3 conform)
Step 2 (3rd NOOP)  → HARD FAIL + idempotent refund + scene.twoshot_stage = needs_clip_rerender
```

Both variants already exist in `RETRY_VARIANTS` / `V5_RETRY_VARIANTS` and are dispatched by `compose-dialog-segments`' v130 `buildAsdStrategy()` — single source of truth, no payload patching. The ladder honours the v129.29 SYNC-3-ONLY directive: no lipsync-2-pro fallback, no model swap. Per `mem://architecture/lipsync/sync-3-doc-strict-options-v106` only `sync_mode` + `active_speaker_detection` ship; `temperature` / `occlusion_detection_enabled` remain forbidden.

State carried on each pass:
- `noop_escalation_step: 0 | 1 | 2` — single source of truth for the rung
- `noop_retry_attempt_id` — new UUID per escalation, lets the safe-entry guard re-open the pass
- `noop_retry_attempted: true` — kept for back-compat with v131 watchdog
- `previous_noop_output_url` + `previous_noop_size_ratio` — forensics

### 2. Terminal coord-refresh guard refined

`compose-dialog-segments` (`v128 COORD-REFRESH-SKIPPED` block) used to block coord refresh for any terminal pass. v134 carves out a single exception: if the pass is currently in an active NOOP-retry cycle (status reset to `pending` AND `noop_escalation_step > 0` AND `noop_retry_attempt_id` set), the freshly resolved coord is allowed through. Truly terminal passes (done/failed without an active retry id) remain protected.

This matters because step 0→1 ladder is specifically designed to change the input vector; refusing a better coord defeats the purpose.

### 3. Forensics: turn_idx populated

Every `syncso_dispatch_log` row written by compose-dialog-segments / sync-so-webhook in the v134 path now populates the dedicated `turn_idx` column instead of stashing it only in `meta.pass_idx`. The new NOOP_ESCALATING and NOOP_LADDER_EXHAUSTED log statuses carry `meta.speaker_name`, `meta.noop_escalation_step`, `meta.from_variant`, `meta.to_variant`, `meta.rung_label`, and `meta.attempt_id`. Diagnosing the next NOOP is a single SQL query, not a 20-minute treasure hunt.

### 4. UI transparency

`SceneInlinePlayer` shows an explicit `NOOP-Retry läuft (Stufe N/2)` banner when any pass is in an active escalation. Sub-line names the speaker, the rung label (`sync-3 bounding_boxes_url` or `sync-3 bounding-box ASD`), and reminds the user that after step 2 a hard-fail occurs. No more silent 10-minute wait.

When no escalation is active, the banner shows `Sync.so · Pass N/M` so the user can see linear progress.

## Wall-time expectation

| Scenario                | Pre-v134     | Post-v134    |
| ----------------------- | ------------ | ------------ |
| 4 speakers, 0 NOOP      | 4–6 min      | 4–6 min      |
| 4 speakers, 1 NOOP/pass | 8–10 min     | 5–6 min      |
| 4 speakers, 2 NOOP/pass | 10–12 min    | 6–7 min      |
| 4 speakers, 3+ NOOP/pass | 12+ min (silent mouth shipped) | ~4 min hard-fail + refund + clear UI hint |

## What we deliberately did NOT change

- Plan-D fan-out orchestrator (parallel dispatch works fine).
- Plate-identity matching (v133).
- Turn-visibility pre-gate (v132).
- 8-pass-level watchdog timeout (v131).
- buildAsdStrategy single-source builder (v130).
- Schema (all required columns already exist on `syncso_dispatch_log`).

## Validation

1. Trigger 4-speaker scene → expect first-try success in `~4–5 min` median.
2. If any pass NOOPs, `syncso_dispatch_log` shows `NOOP_ESCALATING` with non-null `turn_idx` and `meta.speaker_name`, then either `DISPATCHED` (variant=`bbox-url-pro`) succeeds, or `NOOP_ESCALATING` step=2 with variant=`coords-pro-box`, or finally `NOOP_LADDER_EXHAUSTED` and the scene moves to `needs_clip_rerender` with a German user-facing error message.
3. `SceneInlinePlayer` shows `NOOP-Retry läuft (Stufe N/2)` while escalation runs.
4. `composer_scenes.dialog_shots.passes[i].noop_escalation_step` stays bounded ≤ 2.

## Refs

- `supabase/functions/sync-so-webhook/index.ts` — ladder lives in the NOOP-handling block right after the v128 `PASS_DONE_SUSPECT` marker.
- `supabase/functions/compose-dialog-segments/index.ts` — `COMPOSE_DIALOG_SEGMENTS_VERSION = "v134.0"`, terminal-guard exception, DISPATCH_ATTEMPT_STARTED + DISPATCHED logs populate `turn_idx`.
- `src/components/video-composer/SceneInlinePlayer.tsx` — NOOP retry banner.
- `mem://architecture/lipsync/sync-3-doc-strict-options-v106` — sync-3 options whitelist.
- `mem://architecture/lipsync/asd-strategy-single-source-builder-v130` — buildAsdStrategy single source.
