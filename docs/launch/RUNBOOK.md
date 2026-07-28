# AdTool AI — Go-Live Runbook

**Launch:** 2026-07-26
**Owner:** Product/Engineering (single-operator)
**War-room channel:** Slack `#launch-warroom`

---

## T-24h checklist

- [ ] All migrations applied on prod. `supabase--linter` shows only WARN/INFO
- [ ] `security--run_security_scan` — 0 CRITICAL, 0 ERROR open
- [ ] Cloudflare audit (SSL Full-Strict, WAF on, Stripe skip-rules) verified
- [ ] Stripe:
  - [ ] Live keys set (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
  - [ ] Webhook endpoint points at live URL and receives events
  - [ ] Founders coupon `FOUNDERS_VIDEO_20` active
  - [ ] Test-purchase + refund round-trip succeeds
- [ ] Email pipeline: signup / password-reset / welcome / founders
      test-mails land in inbox (not spam) for gmail + outlook + custom domain
- [ ] `robots.txt` allows prod, blocks `id-preview--*.lovable.app`
- [ ] `sitemap.xml` present and reachable
- [ ] Sentry error-rate alert configured, routes to Slack
- [ ] PostHog dashboards live: Signup funnel, Video-gen success, Refund rate

## T-1h checklist

- [ ] `BETA_ACTIVE` flag reviewed (half-finished hubs hidden for non-admins)
- [ ] Founders counter at 0 / 1000
- [ ] `support@useadtool.ai` receives and auto-responds
- [ ] Status page live at `status.useadtool.ai` (instatus.com)
- [ ] All owner accounts have TOTP 2FA enrolled

## Go-live sequence

1. Lower Cloudflare DNS TTL to 300s (do this day before)
2. Publish latest build via preview → publish
3. Manual smoke-test: signup → cast character → generate video → buy credits → refund
4. Trigger founders campaign email
5. Watch Sentry + PostHog in war-room channel for the first 60 minutes

## Rollback ladder

| Level | Action                                                        | ETA       |
| ----- | ------------------------------------------------------------- | --------- |
| L1    | Feature-flag off (`BETA_ACTIVE=false`, per-feature toggle)    | < 1 min   |
| L2    | Cloudflare maintenance page (`/maintenance.html` worker)      | < 5 min   |
| L3    | Chat-history rollback to last known good build + republish    | < 15 min  |
| L4    | Point-in-time DB restore (loses writes since snapshot)        | < 60 min  |

## T+24h review

Record in `docs/launch/POST_LAUNCH_REVIEW.md`:

- Error rate (target < 0.5 %)
- Video-gen success (target ≥ 85 %)
- Refund rate (target < 5 %)
- Support-ticket volume + first-response time
- Founders slots claimed / 1000
- Top-3 friction points observed

## Emergency contacts

- Stripe support: dashboard → Help → Contact
- Cloudflare support: dashboard → Support → Open ticket
- Supabase support (Lovable Cloud): via Lovable chat
