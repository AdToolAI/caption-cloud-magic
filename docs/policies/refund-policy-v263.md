# Refund Policy — v263 (Anchor-Preview-Gate)

**Effective:** with the launch of the Anchor-Preview-Gate.
**Scope:** all AI-video rendering flows in the Motion Studio / Composer.

## Why this exists

Before v263 every identity-drift bug in the Nano-Banana anchor (character
cloned, character missing, wrong face in wrong slot) had to be refunded end-
to-end, because the customer only saw the problem AFTER Hailuo + Sync.so had
already been paid for. The Preview-Gate now lets the user see and accept the
anchor first, which cleanly splits the risk into two categories.

## Two failure categories

### 1. Technical failure → automatic refund

Full auto-refund of every credit spent on that scene when:

- Provider timeout (Hailuo, Kling, Seedance, Sync.so, HeyGen).
- Provider content filter (safety block) after the user confirmed a preview.
- Sync.so mux/stitch error, watchdog kill, Lambda crash, HTTP 5xx from any
  provider.
- Any error where `composer_scenes.clip_status = 'failed'` and
  `clip_error` starts with one of:
  `provider_timeout_`, `provider_5xx_`, `sync_watchdog_`, `lambda_crash_`,
  `mux_failed_`, `content_filter_after_confirm_`.

Handled by the existing `credit-refund-automation` edge function — no
support ticket required.

### 2. User-accepted preview → no automatic refund

When the user has clicked **"Bestätigen & rendern"** on an Anchor-Preview:

- Identity drift (clone / missing / mismatched face) that was already
  visible in the preview is NOT auto-refunded. The audit summary shown in
  the preview card explicitly warns about this.
- Aesthetic re-rolls (lighting, framing, action interpretation, style) are
  NOT auto-refunded — same as every competitor (Runway, Artlist, HeyGen).
- Support may issue a goodwill refund case-by-case; policy is 1 goodwill
  refund per user per 30 days.

## When the Preview-Gate was NOT used

Legacy direct-render flows (existing "Szene rendern" buttons that don't
route through the Preview-Gate) keep the pre-v263 rules for a grace period
of 60 days from launch:

- Identity drift → 1-time goodwill refund per scene on request.
- After the grace period, drift refunds require use of the Preview-Gate.

## What the customer sees

- **Preview success + confirm:** normal render, normal charge. No refund
  for content already visible in the preview.
- **Preview shows drift → user re-rolls preview:** each preview costs
  only the anchor compose step (~1 credit). No Hailuo/Sync spend.
- **Preview shows drift → user gives up:** no charge for the render.
  Preview-compose credits (~1) are non-refundable — they represent real
  Nano-Banana + audit spend.
- **Preview timeout / preview failure:** auto-refund of preview credits.
- **Full render technical failure after confirm:** auto-refund of the
  full render.

## Server invariants

`compose-video-clips` must:

1. Persist `preview_anchor_url`, `preview_audit`, `clip_status =
   'awaiting_confirmation'` when `previewOnly: true`. It must NOT dispatch
   Hailuo or Sync.so in that mode.
2. On the follow-up invocation (no `previewOnly` flag), reuse the pinned
   anchor via the existing `prevAuditOk` cache path — never re-compose.
3. Any classified technical failure must set a `clip_error` prefixed as
   listed above, so `credit-refund-automation` can match it deterministically.

## Change log

- **v263** — Introduce Preview-Gate; split refund categories.
