---
name: v121 Lipsync provider_unknown_error Stop-Loss
description: sync-so-webhook short-circuits the retry ladder after a single retry when Sync.so returns `provider_unknown_error` with no error_code, so the scene goes terminal-failed + refund instead of churning between full-plate / preclip variants for 10+ minutes. Also corrects the outdated compose-dialog-segments header that claimed per-segment ASD did not exist — Sync.so docs document `segments[].optionsOverride.active_speaker_detection` today; migration to that single-call route is the next planned step.
type: feature
---

# v121 — provider_unknown_error Stop-Loss

## Why
- Scenes 0207e3a4… and ec4290f2… hung at 95% for 10+ minutes because the
  webhook kept walking the retry ladder (`bbox-url-pro` → `coords-pro` →
  `coords-pro-box` → `sync3-coords` → `coords-pro-lp2pro`) on opaque
  `provider_unknown_error` failures, even though the payload was already
  doc-strict for sync-3. Variant churn never recovered.
- The official Sync.so error vocabulary expects a real `error_code` for
  recoverable failures. Generic "An unknown error occurred." with no code
  means the provider itself does not know — further variant churn cannot
  help.

## What
- `sync-so-webhook` now sets `canRetry=false` when ALL of:
  - `codeBucket === "unknown"`
  - `errClass === "provider_unknown_error"`
  - no `error_code` from Sync.so
  - `passRetryCount >= 1` (one retry already burnt)
- Result: scene goes terminal `failed`, `lipsync-watchdog` no longer needs
  to act as the primary failsafe, refund kicks in via the existing
  `sceneWillFail` branch.

## Doc-current note
`compose-dialog-segments` header used to claim that Sync.so does not
support per-segment ASD. The current docs document
`segments[].optionsOverride.active_speaker_detection`. Header comment was
corrected; the actual migration to a single-call `segments[]` dispatch is
tracked as the next step and is not part of this patch.

## Files
- `supabase/functions/sync-so-webhook/index.ts`
- `supabase/functions/compose-dialog-segments/index.ts` (header comment)
