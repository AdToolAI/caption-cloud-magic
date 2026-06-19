---
name: v132 Turn-Visibility Pre-Gate
description: Pre-dispatch face-visibility gate per speaker turn timestamp — refunds + forces plate re-render BEFORE wasting 10 min on preclip Lambda loop
type: feature
---

# v132 — Turn-Visibility Pre-Gate

## Problem
Production failure mode (DB-confirmed scene `7906f214…`, 2026-06-19):
- 4-speaker dialog (Samuel, Matthew, Kailee, Sarah).
- Passes 1–3 rendered cleanly and lipsynced.
- Pass 4 (Sarah, sitting near top edge of plate, last in dialog timeline) failed with `face_gate_failed:count=0 (after 2 v116 repair attempts)` → scene died as `v107_preclip_required_for_multispeaker`.
- User experience: ~10 minutes of waiting, watchdog ticks, retry loops, opaque error message, full refund eventually.

Root cause: Hailuo i2v plate looked fine globally (4 faces detected during initial `plate-identity` probe) but by Sarah's actual turn time the speaker was no longer reliably visible in the crop window. We only found this out after rendering 3 expansion-ladder preclips × 90s each.

## Fix
**Before any wallet debit cost is wasted and before any preclip Lambda is invoked**, validate that every speaker is actually visible at their own first-turn timestamp on the master plate.

Location: `supabase/functions/compose-dialog-segments/index.ts` (after `plateIdentityMap` resolution + v117 plate-quality-gate, before preclip render loop).

For each speaker:
1. Compute first-turn mid second from `voicedRange.turns[0]`.
2. Call `validate-frame-face` on the plate at `frame = round(midSec × 30fps)`.
3. If `ok && faceCount < 1` → fail-fast.

Failure path:
- Refund credits immediately.
- `composer_scenes.lip_sync_status='failed'`, `twoshot_stage='needs_clip_rerender'`, `clip_status='pending'`, `clip_url=null` so the user's "Alle generieren" automatically re-renders the plate instead of looping on Sync.so.
- `clip_error` lists which speaker, at which second.
- `dialog_shots.v132_turn_gate = { failures, probes }` for forensics.
- `syncso_dispatch_log` row with `error_class='v132_turn_visibility'`.

Permissive on validator outage: `v.ok === false` ⇒ proceed (do NOT block on a flaky vision model).

Bypass: first-attempt only. `isAdvance / isRetry / isV41Retry` skip the gate (already validated on initial run).

Env override: `FORCE_SKIP_TURN_VISIBILITY_GATE=true` (escape hatch for ops).

## Companion fix
The legacy v107 hard-fail (after preclip loop) now writes a human-friendly `clip_error` that names the failed speaker + turn window, and resets `clip_status='pending'` + `twoshot_stage='needs_clip_rerender'` so the next "Alle generieren" re-renders the plate instead of replaying the failure.

## Why this is the root-cause fix (not a retry band-aid)
- No 20-minute waiting on Watchdog timeouts.
- No 3-Lambda × 4-pass burn for a plate we already know is unrenderable.
- No silent provider_unknown_error loops.
- User immediately sees: "Sprecher X ist bei Sekunde Y nicht im Bild — Scene neu rendern".

## Cost
1 Gemini-Vision face probe per speaker per scene on first dispatch. ~50ms cached, ~3s cold. Total < 12s for a 4-speaker scene vs. saved 10+ min in failure cases.
