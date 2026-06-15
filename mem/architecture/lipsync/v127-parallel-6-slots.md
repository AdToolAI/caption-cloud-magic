---
name: v127 Parallel 6-Slot Dispatch
description: Sync.so concurrency cap raised 4→6 to match Creator+ $49/mo plan; 5- and 6-speaker scenes now dispatch in one wave
type: feature
---

# v127 — Parallel 6-Slot Dispatch (Sync.so Creator+ Plan)

**Activated:** June 15, 2026. Builds on top of v126 (FROZEN — see `v126-recovery-reference.md`).

## What changed

Single Hebel: concurrency cap 4 → 6.

| Stelle | Vorher | Nachher |
|---|---|---|
| `system_config.composer.sync_so_concurrency_cap` | `4` | `6` |
| `compose-dialog-segments` `MAX_INFLIGHT` (Z. ~1992) | `4` | `6` |
| `compose-dialog-segments` parallel fan-out hard ceiling `Math.min(4, …)` (Z. ~3993) | `4` | `6` |

Nothing else. The v126 chain-advance logic (Webhook `triggerV5Advance` Z. 654 + Watchdog Z. 268–292) was already bulletproof — no edits needed there.

## Why

Sync.so $49/mo Creator+ plan permits 6 concurrent generations per account. The previous cap of 4 forced 5- and 6-speaker scenes into chained tails (~100s per extra pass) and also blocked a second composer run as soon as any 4-speaker scene was active.

## Expected effect

| Scenario | Pre-v127 | Post-v127 |
|---|---|---|
| 1 speaker | ~2 min | ~2 min |
| 2 speakers | ~3–4 min | ~3 min |
| 4 speakers | 8–10 min | **5–6 min** |
| 6 speakers | ~14 min (chained) | **5–6 min** |

Healthy 4-speaker scenes already fit in one wave under the old cap. The real gain is for 5/6-speaker scenes and for a second composer run not blocking on the first.

## What is INVIOLATE (carried from v126)

- `sync-3` model, `sync_mode: cut_off`, `active_speaker_detection: { auto_detect: true }`
- **Forbidden options**: `bounding_boxes*`, `coordinates`, `frame_number`, `temperature`, `occlusion_detection_enabled`
- Default variant: `coords-pro`
- Preclip pipeline (single-face square via Remotion Lambda)
- Retry-clear list in `sync-so-webhook`
- Watchdog `STALE_HARD_MS = 25 min`, `STALE_PROVIDER_MS = 10 min`

## Restore procedure (if rollback needed)

1. `UPDATE system_config SET value = '4'::jsonb WHERE key = 'composer.sync_so_concurrency_cap';`
2. In `compose-dialog-segments/index.ts`: `MAX_INFLIGHT = 4` and `Math.min(4, …)`.
3. Redeploy edge function.

## Risk

Sync.so account limit is global, not per-scene. Two parallel composer runs with 4 speakers each = 8 dispatches → 6 run, 2 defer via existing `syncso_concurrency_deferred` path (v98, tested). No 422 crashes.
