# Read-only Audit: Meta Pages, Instagram, TikTok Posting

No code, database, secret or provider state was changed. All findings come from reading the codebase and read-only queries.

## Verdicts

| Platform | Verdict |
| --- | --- |
| Meta / Facebook Pages | B) IMPLEMENTED BUT NOT PROVEN END-TO-END (last proven post 2026-04-10, before the current token and before the Graph-version drift) |
| Instagram Professional | C) PARTIALLY IMPLEMENTED / BLOCKED (no Instagram connection row exists in the database at all right now) |
| TikTok | D) BROKEN / MISCONFIGURED (all three stored connections are expired and the refresh code path cannot succeed) |

## 1. Meta / Facebook Pages

**OAuth**: `facebook-oauth-start` (Graph v24.0, `META_APP_ID`, `META_LOGIN_CONFIG_ID`, `META_REDIRECT_URI`) → `oauth-callback` → long-lived token via `grant_type=fb_exchange_token` (~60 days) → page choice via `facebook-list-pages` / `facebook-select-page` using `_shared/meta-page-discovery.ts`.

**Scopes requested**: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`.

**Storage**: `social_connections` (`access_token_hash`, `refresh_token_hash`, `token_expires_at`, `account_id`, `account_metadata`). Tokens are AES-GCM encrypted (`_shared/crypto.ts`, `ENCRYPTION_SECRET`). RLS is on with per-user policies plus a service-role policy; users can read their own (encrypted) token rows.

**Live evidence**: exactly one Facebook connection exists (created 2026-08-08, page selected, `selection_required: false`, token valid until 2026-10-07). `publish_results` shows 14 successful Facebook posts, the most recent on 2026-04-10 — i.e. no proven post with the current token.

**Posting path**: `publish/index.ts` → `publishToFacebook` (photos `/photos`, videos resumable `upload_phase` start/transfer/finish).

**Risks found**
- `publish/index.ts` still calls `graph.facebook.com/v18.0` in 7 places, while OAuth and page discovery use v24.0. v18.0 is past Meta's deprecation window, so the posting path may fail even though the connection is healthy. This is the single most likely cause of a future silent break.
- The current Facebook row has no `granted_scopes` in `account_metadata`, so the "reconnect for business_management" banner in `ConnectionsTab.tsx` cannot evaluate it — the UI shows "connected" without proving scope coverage.

## 2. Instagram Professional

**OAuth**: `instagram-oauth-start` (hard reset: revokes permissions via `v24.0/{id}/permissions` DELETE and deletes IG/FB rows before restarting) → same `oauth-callback` → `me/accounts` + `instagram_business_account`; the page token is stored in `account_metadata.page_access_token_encrypted` while `account_id` stays the IG user id.

**Scopes**: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`.

**Live evidence**: `social_connections` currently contains **no Instagram row**. Historically 11 successful Instagram posts, the last on 2026-04-23, and 9 failures (`INSTAGRAM_ERROR`, incl. `OAuthException (2)`).

**Posting path**: `publish/index.ts` → `publishToInstagram` (container create → `status_code` polling `FINISHED`/`ERROR`/`IN_PROGRESS`, 5 min video / 2 min image timeout → publish).

**Risks found**
- Three competing Instagram paths with different auth models: `publish` (per-user connection token, v18.0), `instagram-publish` (app-wide `IG_PAGE_ACCESS_TOKEN` from `app_secrets`, v24.0), `publish-to-instagram` (`IG_PAGE_ID` / `IG_PAGE_ACCESS_TOKEN` from env, v18.0). Only the first is multi-tenant.
- `publishToInstagram` uses the connection's user token, not the stored `page_access_token_encrypted`; Instagram Content Publishing normally requires the page token.
- Same v18.0 deprecation exposure as Facebook.

## 3. TikTok

**OAuth**: `tiktok-oauth-start` → `/api/oauth/tiktok/callback` (SPA route `TikTokOAuthCallback.tsx`) → `tiktok-oauth-callback`. Scopes `user.info.basic,video.upload,video.publish`. Keys via `_shared/tiktok-api.ts` (`TIKTOK_ENV`, `TIKTOK_CLIENT_KEY[_PROD]`, `TIKTOK_CLIENT_SECRET[_PROD]`, `TIKTOK_REDIRECT_URI[_PROD]`, sandbox `sb…` keys are skipped).

**Live evidence**: 3 TikTok connections, all with expired access tokens (latest expiry 2026-08-07). Only 2 successful publishes ever (2026-04-05/07); 11 failures with `TT_ERROR`: `upload init failed: 403/401`, `failed to parse header value`, `Failed to download video from storage`, `token expired and refresh failed`.

**Confirmed defects**
- `refreshAccessToken` in `_shared/tiktok-api.ts` reads `data.data` and rejects when it is missing, but TikTok's v2 token endpoint returns the fields flat (the sibling `exchangeCodeForTokens` even documents this). Every refresh therefore throws → matches the recorded `token expired and refresh failed` results. TikTok access tokens live 24h, so this makes TikTok posting unusable beyond one day per connect.
- `tiktok-upload/index.ts` (the path used from `ConnectionsTab.tsx`) does `atob(connection.access_token_hash)` on an AES-GCM ciphertext instead of `decryptToken` → binary garbage in the Authorization header, which is exactly the `failed to parse header value` signature. It also posts `privacy_level: 'SELF_ONLY'` (draft only).
- `publishToTikTok` in `publish` returns `ok: true` right after `init` + file PUT, without polling `post/publish/status/fetch/`. A recorded TikTok success therefore does **not** prove a video went live.

## 4. Scheduler paths

- Active cron: `dispatch-calendar-publishing` (5 min, `calendar-publish-dispatcher`), `autopilot-publish-due-5min`, `notify-expired-tokens-hourly`, `auto-refresh-meta-tokens-daily`.
- `calendar-publish-dispatcher` and `check-scheduled-publications` call `publish` with the correct `{ user_id, text, media, channels }` shape — same path as the UI.
- `check-scheduled-publications` has **no cron job**, so rows written by `useScheduledPublishing` are never dispatched unless something else invokes it.
- `poster-dispatcher` calls `publish` with `text_content` and no `user_id`; `publish` expects `text` + `user_id`, so this dispatcher cannot succeed as written.

## 5. Cross-cutting

- Idempotency: `publish_jobs.content_hash` (24 h) plus an in-memory cache and an `active_publishes` cap of 4. Retries on the calendar path use `RETRY_DELAYS_MINUTES`; `scheduled_publications` retries up to 3 times.
- Secrets are referenced only by name (`META_APP_ID/SECRET`, `TIKTOK_*`, `ENCRYPTION_SECRET`, `IG_PAGE_*`, `GOOGLE_*`, `LINKEDIN_*`, `X_*`); none were read or exposed. Whether each is actually set in production cannot be proven statically — `tiktok-health`, `oauth-config-check` and `social-health` report presence booleans without values.
- Frontend "connected" state (`usePlatformCredentials`, `ConnectionsTab`) is derived purely from the existence of a `social_connections` row. It does not check token expiry or scopes, so all three currently expired TikTok rows still render as connected.
- Diagnostics available: `tiktok-health`, `social-health`, `meta-page-probe`, `oauth-config-check`, `notify-expired-social-tokens`, `auto-refresh-meta-tokens` (+ `MetaTokenHealthTab` in the QA Cockpit). No automated test covers the social posting paths.

## 6. Minimum safe test plan (not executed)

1. **Config probe, zero side effects**: call `oauth-config-check`, `tiktok-health`, `social-health` and confirm every required secret reports present and the TikTok redirect URI matches the portal byte-for-byte.
2. **Facebook**: on the existing connection, run `meta-page-probe` / `facebook-list-pages` to confirm the page, `business_management` in `granted_scopes` and a live page token. Then one image post to a **test page** with a timestamped caption; verify `publish_results.ok`, `external_id`, `permalink`, and open the permalink.
3. **Instagram**: reconnect Instagram (currently no row), confirm the IG business account and page token, then publish one image to a **private/test IG professional account**; watch the container `status_code` polling to `FINISHED` and open the permalink.
4. **TikTok**: reconnect one account for a fresh 24 h token, then a short video with `privacy_level: SELF_ONLY` (private) and verify in the TikTok app. Then, +25 h later, retry to prove the refresh path — this is expected to fail until the `data.data` bug is fixed.
5. **Scheduler**: schedule one calendar event 10 minutes out on the already-proven Facebook test page and confirm `calendar-publish-dispatcher` produces the same successful `publish_results` row as the manual test.
6. Record every test in `publish_results` and delete the created posts afterwards.

## 7. Fixes this audit would recommend (not applied)

1. TikTok `refreshAccessToken` flat-response parsing.
2. `tiktok-upload` `atob` → `decryptToken`.
3. Graph v18.0 → v24.0 across `publish/index.ts`.
4. Instagram publishing to use `page_access_token_encrypted`.
5. TikTok publish status polling before reporting `ok: true`.
6. `poster-dispatcher` payload shape, and a cron for `check-scheduled-publications` (or remove that path).
7. Connection UI to reflect token expiry and scope coverage, not just row existence.
