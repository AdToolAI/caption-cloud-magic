---
name: v129.4 Terminal Scene Aggregation
description: sync-so-webhook now terminalises 3+ speaker scenes immediately on a required-pass failure (cancels pending siblings, idempotent refund); watchdog no-ops on already-terminal scenes; every dispatch log carries provider_input_fingerprint
type: feature
---

**Rule:** In `supabase/functions/sync-so-webhook/index.ts` (v5 sync-segments branch, inside `withDialogLock`), a terminal pass failure in a 3+ speaker scene immediately terminalises the scene. Non-terminal sibling passes (`pending` / `rendering` / `retrying`) are cancelled to `canceled_by_scene_failure`; already-terminal passes are left untouched. Refund is idempotent via the existing `refunded` boolean. Failure fields are consistent: `last_error_class`, `sync_error_bucket` (`terminal_provider_unknown_no_retry` for opaque `provider_unknown_error`), `scene_failure_source: "sync-so-webhook"`, `watchdog_finalized: false`, `v1294_required_pass_failure: true`.

**Late-webhook guard:** webhooks for already-`failed` scenes are acked 200 with `skipped: "ignored_due_scene_failed"`.

**Watchdog:** `lipsync-watchdog` no-ops on rows whose `lip_sync_status` is `failed` / `applied` / `canceled` or whose `dialog_shots.status` is `failed` / `done` / `canceled`. The webhook is the single source of truth for terminalisation; the Watchdog never overwrites its root cause.

**Telemetry (v129.4b):** every DISPATCHED row in `syncso_dispatch_log.meta` carries `provider_input_fingerprint` (model, sync_mode, video dims/duration/fps/frame_count/url_hash, audio duration/lead_in/voiced_end/peak_dbfs/sample_rate/channels/url_hash, ASD shape + coord_in_bounds, preclip_ambiguity, speakers). Pure evidence — no behaviour change.

**Out of scope:** no pre-dispatch block on short preclip + cut_off + centered coords (false-positive risk), no safe-pad, no new retry/model ladder, no crop change, no v129.1/v129.2.1/v129.3 rollback.

**v128 invariants preserved:** `COMPLETED_NOOP_SUSPECT` terminal, `provider_unknown_error` terminal, no automatic retry path. v129.4a only changes WHEN the scene aggregation flips to `failed` (now immediately under the lock instead of after the Watchdog hard-TTL).

**Root case:** Scene `d61c49fb-…` Samuel pass-1 — payload was v129.1/v129.2.1/v129.3-clean (preclip 2.31s, audio 2.25s, lead-in 0.10s, doc-strict coords [360,360], in-bounds, preclip_ambiguity clean) yet Sync.so returned `provider_unknown_error`. Old code left 4 pending sibling passes alive → scene `running` for 10 min until `watchdog_provider_timeout` overwrote the real cause. v129.4a closes that gap.
