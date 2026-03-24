

## Problem

The `sync-social-posts-v2` Edge Function only auto-refreshes YouTube tokens before syncing. X (Twitter) OAuth2 tokens expire every ~2 hours, but the function never refreshes them — it just tries to use the expired token, gets a 401, and throws a generic Edge Function error.

## Solution

Add X token auto-refresh to `sync-social-posts-v2` and improve error messages when reconnection is needed.

## Changes

### 1. Add `refreshXToken()` to `supabase/functions/_shared/token-refresh.ts`

- New function similar to `refreshYouTubeToken`
- Calls `https://api.twitter.com/2/oauth2/token` with Basic auth (`X_CLIENT_ID:X_CLIENT_SECRET`)
- Updates `social_connections` with new encrypted access + refresh tokens
- Returns `{ accessToken, error }` like YouTube version

### 2. Update `supabase/functions/sync-social-posts-v2/index.ts`

- Import `refreshXToken` from shared module
- Extend the token refresh block (lines 97-118) to also handle `provider === 'x'`:
  - Check `token_expires_at`, if expired → call `refreshXToken()`
  - On unrecoverable errors → return `{ success: false, reconnect_required: true, provider: 'x' }` with HTTP 200
- Update `fetchXPosts` to use `api.x.com` instead of `api.twitter.com`

### 3. Update `src/components/performance/ConnectionsTab.tsx`

- After sync response, check for `reconnect_required` flag
- Show specific toast: "X Token abgelaufen. Bitte trenne die Verbindung und verbinde X erneut."

## Technical Details

- X OAuth2 refresh uses Basic auth with `btoa(CLIENT_ID:CLIENT_SECRET)`
- X returns a new `refresh_token` with each refresh (must update both tokens)
- `X_CLIENT_ID` and `X_CLIENT_SECRET` secrets are already configured
- Uses `api.x.com` endpoint per Twitter API best practices

