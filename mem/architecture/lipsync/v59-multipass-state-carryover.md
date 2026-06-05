---
name: v59 Multipass State Carry-Over
description: Once v58 force_multipass fires for a scene, the `force_multipass` and `multipass_fallback_attempted` markers MUST survive every subsequent state write in `compose-dialog-segments` and every pass-level retry re-dispatch from `sync-so-webhook`. Otherwise a failing v5 pass-0 retry re-enters the broken sync-3 segments[] path, triggers v58 again, refunds 81 credits, and loops forever (observed on scene ac044e0a-e72a-4aac-9153-25e3e82bdcfd, ~1 cycle every 40s).
type: architecture
---

## Bug

1. v58 webhook writes `dialog_shots = { force_multipass: true, multipass_fallback_attempted: true }` and dispatches `compose-dialog-segments` with `force_multipass: true` body.
2. v5 fan-out dispatches pass-0 and overwrites `dialog_shots` with a fresh `{ version: 5, engine: "sync-segments", ... }` state that does NOT include the multipass markers.
3. Pass-0 fails with provider_unknown_error → webhook v5 retry path re-dispatches `compose-dialog-segments` with `{ retry: true }` only (no force_multipass).
4. compose-dialog-segments re-evaluates `useV41Official` against the stripped state → 3 speakers + !isAdvance → re-enters the sync-3 segments[] payload → fails → v58 fires again → infinite loop.

## Fix

`supabase/functions/compose-dialog-segments/index.ts`:
- Gate `useV41Official` additionally on `!stateMultipassAttempted`. The attempted marker is sticky for the whole scene lifetime.
- When building the v5 `state` for the new write, carry `force_multipass`, `multipass_fallback_attempted`, and `multipass_fallback_reason` from `prevState`/`existing`.

`supabase/functions/sync-so-webhook/index.ts`:
- v5 retry re-dispatch body now includes `force_multipass: true` when the current dialog_shots state already has either marker.

## Why not retry the same sync-3 payload

Sync.so docs/developer-guides/segments only show `lipsync-2` examples. sync-3 supports `active_speaker_detection` per docs/models/lipsync but our `segments[]` shape returns `An unknown error occurred.` reliably on multi-speaker plates. The v58 fan-out (one Sync.so call per speaker, single-coord ASD, chained passes) is the only stable path for ≥3 speakers.
