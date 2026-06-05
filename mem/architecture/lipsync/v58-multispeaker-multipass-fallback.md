---
name: v58 Multi-Speaker Multipass Fallback
description: When the v56 single-call Sync.so `segments[]` dispatch (model `sync-3`, manual point ASD) fails on a ≥3-speaker scene with the opaque `provider_unknown_error`, `sync-so-webhook` no longer wastes the retry slot re-sending the same payload. It refunds idempotently, sets `dialog_shots.force_multipass = true` (version 58, engine `sync-multipass-fallback-v58`), and re-dispatches `compose-dialog-segments` with `{ force_multipass: true }`. The dispatcher then skips the v56 segments[] branch entirely and uses the proven per-speaker chained pipeline (one Sync.so call per speaker, single-coord ASD, pass N output feeds pass N+1) — the only payload shape Sync.so accepts reliably for multi-speaker plates. Replaces the prior dead-end behaviour where multi-speaker v56 unknown-errors used the transient retry slot on an unchanged payload and then failed terminally.
type: architecture
---

## Trigger

In `sync-so-webhook`:
```
isV56Manual && isMultiSpeaker (≥2 speaker_refs)
  && codeBucket === "unknown"
  && (errClass === "provider_unknown_error" || "unknown")
  && !state.multipass_fallback_attempted
```

## Action

1. Refund `state.cost_credits` once (`refunded: true`).
2. Reset `dialog_shots` to a clean v58 queued shell with `force_multipass: true`, `multipass_fallback_attempted: true`, `previous_engine`, `previous_error`, `previous_error_code`, `cost_credits: 0`.
3. Fire-and-forget POST to `compose-dialog-segments` with body `{ scene_id, force_multipass: true }`.

## Dispatcher gate

`compose-dialog-segments`:
```
const forceMultipass = body?.force_multipass === true;
const stateForcesMultipass = existing?.force_multipass === true;
let useV41Official =
  !forceMultipass && !stateForcesMultipass &&
  speakers.length >= 3 && (isV41Retry || !isAdvance);
```
With `forceMultipass` set, the function falls through to the v5 per-speaker chained pipeline that already serves 1–2 speaker scenes reliably.

## Why not retry the same payload

Sync.so’s `segments[]` guide documents only `lipsync-2` examples; `sync-3 + segments[]` returns `generation_unhandled_error` ("An unknown error occurred.") on many real plates. Re-sending the exact same payload (the previous behaviour) is a guaranteed no-op against this provider error class.

## Why not the deprecated per-turn pipeline

`compose-dialog-scene` is a deprecated thin forwarder (June 2026 unification) — the per-turn dispatcher also returned unknown errors. The chained per-speaker fan-out on a single master plate is the historically stable path.
