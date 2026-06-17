---
name: v129.5 Sync.so Provider Experiment Track
description: Admin-only forensic tools for Sync.so provider_unknown_error — support-bundle generator + isolated replay endpoint with 7 override presets, all decoupled from live pipeline
type: architecture
---

# v129.5 — Provider Experiment Track

Hard isolation from production: edge functions `syncso-support-bundle`, `syncso-replay`, `syncso-replay-webhook` are admin-only and never mutate `composer_scenes`, `dialog_shots`, `syncso_dispatch_log`, wallet, refund system, or watchdog.

Replay payloads always send `webhookUrl` to `syncso-replay-webhook` (separate `REPLAY_WEBHOOK_SECRET`), never the production `sync-so-webhook`. All outcomes land in append-only `syncso_replay_log` (admin SELECT via `has_role`, service_role INSERT/UPDATE only).

Override presets (1 click = 1 call, no try-all): `exact`, `omit_sync_mode`, `loop`, `bboxes` (per-frame bounding boxes derived from v129.1 plate coords), `auto_detect` (lab only), `lipsync_2_pro`, `lipsync_2`. Models `sync-3`, `lipsync-2-pro`, `lipsync-2` only — `sync-2` is rejected as undocumented.

Support bundle includes: `provider_truth.get_generation` via `GET /v2/generate/:id` (flags `error_code_missing` when Sync.so returns no error_code), asset sha256, light WAV/MP4 metadata probe, sanitized reproducer payload, recent `syncso_dispatch_log` entries.

Guardrails: max 5 replays per `pass_id` per hour, `confirm: true` + `reason` (min 5 chars) required, model whitelist enforced, asset reachability check before dispatch.

UI: admin-only "Forensik" button on failed Composer scene overlay (`SceneInlinePlayer.tsx`) opens `SyncsoForensicsSheet` with Support-Bundle + Replay tabs.

Files: `supabase/functions/syncso-{support-bundle,replay,replay-webhook}/index.ts`, `src/components/admin/SyncsoForensicsSheet.tsx`, `syncso_replay_log` table, `support-bundles` storage bucket (private, signed URLs 24h).
