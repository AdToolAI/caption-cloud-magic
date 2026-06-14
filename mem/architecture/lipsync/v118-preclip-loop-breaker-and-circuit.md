---
name: v118 — Preclip Silent-Loop Breaker + Pass-Level Circuit Breaker
description: Fixes the infinite "Lip-Sync läuft 95%" loop caused by the v115 preclip path hardcoding ASD `coordinates: [outSize/2, outSize/2]` (= [360,360] on 720 preclips) when the face-gate confirmed 0 or >1 faces. Sync.so rejects every such payload with `provider_unknown_error` and the dispatcher retries forever, never refunding. v118 reroutes those passes to full-plate `bbox-url-pro` with real face coordinates from `faceMap`, ignores `retry_variant` only inside the safe preclip auto_detect window, caps each (scene,pass) at 5 FAILED dispatches with idempotent refund + scene-failed, and adds a 15-min `pg_cron` watchdog as belt-and-braces.
type: architecture
---

# v118 — Preclip silent-loop breaker

## Root cause (DB-verified scene `4fb6b816…`, June 14 2026)
`syncso_dispatch_log` for Pass 2 (Kailee) showed:
```
retry_variant=coords-pro       payload.active_speaker_detection={auto_detect:false, coordinates:[360,360], frame_number:0}  → FAILED provider_unknown_error
retry_variant=coords-pro       same payload                                                                                  → FAILED
retry_variant=coords-pro-box   same payload                                                                                  → FAILED
… infinite ascent
```

The v115 preclip branch in `compose-dialog-segments/index.ts` (lines 2846-2891) was reached first and overrode the `retry_variant` elseif chain at line 2929+. Whenever the preclip face-gate did **not** confirm exactly 1 face, the fallback hardcoded `coordinates: [outSize/2, outSize/2]`. On a 720 preclip that is `[360, 360]` — Sync.so's active-speaker pointer at an empty pixel, which reproducibly returns `provider_unknown_error`. The dispatcher had no max-retry circuit breaker, so the webhook bounced back into the dispatcher endlessly, never refunding, never marking the scene failed. UI hung at "Lip-Sync läuft 95%" forever.

## Fixes (all inside the v60 serial sync-3 chain)

### Fix A — preclip face-gate bypass (`compose-dialog-segments/index.ts` ~L2843)
After v107 has accepted the preclip path, re-check the validated face count.
- `passFaceCount === 1` → keep preclip + `auto_detect: true` (v115, unchanged).
- `passFaceCount !== 1` → set `usePassPreclip = false`, clear `pass.preclip_url`, force `retryVariant = "bbox-url-pro"` if not already a bbox variant. The downstream elseif at line 2941 then builds the real plate-pixel box from `faceMap` and dispatches on the full plate.
- Also drop preclip when a webhook-escalated variant (`auto-pro`, `auto-standard`, `bbox-url-pro`, `coords-pro-box`) reaches the preclip pass — those variants only make sense on the full plate.

Required type change: `const retryVariant` → `let retryVariant` (L2054), `const usePassPreclip` → `let usePassPreclip` (L2733).

### Fix B — Pass-level circuit breaker (~L2007)
Right after `currentPassIdx` is selected, count `syncso_dispatch_log` rows where `scene_id` = current AND `sync_status='FAILED'` AND `meta->>pass_idx` = current. If `>= 5`:
- Refund `totalCost` to the wallet (idempotent — guarded by `dialog_shots.refunded`).
- Set `clip_status='failed'`, `lip_sync_status='failed'`, `twoshot_stage='failed'`, `clip_error` with bilingual message naming the failing speaker.
- Log `sync_status='CIRCUIT_BREAKER_OPEN'`, `error_class='v118_pass_circuit_breaker'`.
- Return 422.

Wrapped in try/catch — a circuit-breaker probe failure must never block dispatch.

### Fix C — 15-min `pg_cron` watchdog (belt & braces)
`lipsync_watchdog_15min()` SECURITY DEFINER function force-fails any `dialog_mode=true` scene that has been `clip_status IN ('processing','dispatching','rendering')` for more than 15 min. Scheduled every 2 min as cron job `lipsync-watchdog-15min`. Refund (if not yet done) is then triggered by the next dispatch attempt's circuit breaker or by `reset-lipsync-scene`.

## What stays unchanged
- v60 serial chain, sync-3 model, v115 single-face `auto_detect:true` on verified 1-face preclips, v82 `bbox-url-pro` ladder, v106 doc-strict options, v116/v117 plate-quality gate.
- Sync.so request shape, webhook chain, pricing, idempotent refund helper.

## Verification
1. Reset scene `4fb6b816…` (done in this migration); auto-trigger picks it up.
2. Edge log shows `v118_preclip_facegate_bypass face_count=0` (or >1) for failing speakers, followed by `BBOX_ASD variant=bbox-url-pro`.
3. New `syncso_dispatch_log` rows have `meta->'webhook_payload'->'options'->'active_speaker_detection'` with **real plate-pixel coords**, not `[360,360]`.
4. Worst case: 5 FAILED rows → next attempt opens circuit breaker, scene becomes `clip_status='failed'`, wallet balance restored, no further Sync.so calls.

## Files
- `supabase/functions/compose-dialog-segments/index.ts` (~L2002–2095, L2054, L2732–2734, L2842–2879)
- Migration: `lipsync_watchdog_15min()` + `lipsync-watchdog-15min` cron job
- `mem/architecture/lipsync/v118-preclip-loop-breaker-and-circuit.md`

## Rollback
- Fix A: remove the bypass block, restore `const` on retryVariant/usePassPreclip.
- Fix B: raise `PASS_FAIL_CAP` to 999 ⇒ effectively off.
- Fix C: `SELECT cron.unschedule('lipsync-watchdog-15min');`
