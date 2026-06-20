---
name: Composer Master-Clip Watchdog (v149)
description: Recovery for composer scenes stuck on clip_status='generating' when Replicate webhook drops; auto-replays webhook or fails+refunds via qa-watchdog every 2 min.
type: feature
---

# v149 — Composer Master-Clip Watchdog & Replicate-Repoll

## Problem

`compose-clip-webhook` only fires when Replicate calls it. Hailuo / HappyHorse / Kling
occasionally drop webhook callbacks. Without coverage the scene stays on
`clip_status='generating'` + `twoshot_stage='master_clip'` + `clip_url=NULL` forever.
Lipsync never starts (no plate to sync) and the user sees an endless "Szene wird gebaut…".

Existing `qa-watchdog` only covered `lip_sync_status='running'` (stage 2). The plate
generation (stage 1) was unprotected — no auto-refund, no auto-fail, no repoll.

## Solution

### Edge function `recover-stuck-composer-clip`

Input: `{ scene_ids: string[] }` (max 50). Processed sequentially.

Per scene:
1. Load row; skip if `clip_status != 'generating'` or `clip_url` already set.
2. Skip non-Replicate prediction ids (contain `:`, e.g. `sync:...`).
3. `GET https://api.replicate.com/v1/predictions/{id}` with `Authorization: Token <REPLICATE_API_KEY>`.
4. Branch on `prediction.status`:
   - **`succeeded`** → POST the Replicate payload back to `compose-clip-webhook` (with `?token=` + scene/project query params). Webhook is idempotent and handles Cinematic-Sync auto-lipsync handoff. Log `v149_webhook_replayed`.
   - **`failed` / `canceled`** → mark scene failed + refund. Log `v149_clip_failed_refunded`.
   - **`processing` / `starting` / `queued`** → if age > 30 min hard-kill + refund (`v149_clip_hard_killed`), else log `v149_clip_still_processing` and leave alone.
   - **404 from Replicate** → prediction lost, mark failed + refund.

### Refund-Idempotenz

Guard: `clip_error LIKE 'watchdog_%'` → no double-refund on watchdog reruns.
Uses the same `refund_ai_video_credits` RPC + `CLIP_COSTS` table as `compose-clip-webhook`
so charge/refund stay in lockstep.

### `qa-watchdog` Block 4b

Runs every 2 min via existing pg_cron. Selects:
```sql
clip_status='generating' AND clip_url IS NULL AND updated_at < now() - 10min
LIMIT 50
```
→ invokes `recover-stuck-composer-clip` with the ids + files anomaly with fingerprint
`composer-clip-stale`.

### Cinematic-Sync handling

On fail-path: clears `lip_sync_status`, `twoshot_stage`, `lip_sync_source_clip_url`,
`dialog_shots` (mirrors the existing webhook fail-path so re-render works cleanly).

## Thresholds

| Condition | Action |
|---|---|
| Age > 10 min, status=generating, no clip_url | Watchdog dispatches recovery |
| Replicate status=succeeded | Replay webhook (rescue) |
| Replicate status=failed/canceled | Fail + refund |
| Replicate status=processing AND age > 30 min | Hard-kill + refund |
| Replicate status=processing AND age <= 30 min | Heartbeat log only |
| Replicate 404 | Fail + refund |

## Was NICHT geändert

- `compose-video-clips` Dispatch-Logik (Webhook-URL, HappyHorse→Hailuo Migration).
- `compose-clip-webhook` Idempotenz/Logik.
- Lipsync-Watchdog Block 4 (Stufe 2 unverändert).
- v147/v148 Lipsync-Logik.
