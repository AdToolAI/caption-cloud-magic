

## Problem

Der `x-oauth-callback` Edge Function nutzt noch die veraltete `api.twitter.com` Domain. Der Token-Exchange funktioniert noch, aber der `/2/users/me` Endpunkt gibt "Client Forbidden / client-not-enrolled" zurück. Die Migration auf `api.x.com` sollte dieses Problem beheben.

Aus den Logs:
```
User fetch error: {
  detail: "When authenticating requests to the Twitter API v2 endpoints, 
           you must use keys and tokens from a Twitter developer App 
           that is attached to a Project.",
  title: "Client Forbidden",
  reason: "client-not-enrolled"
}
```

## Solution

Alle Twitter API URLs in `x-oauth-callback/index.ts` von `api.twitter.com` auf `api.x.com` umstellen.

## Changes

### File: `supabase/functions/x-oauth-callback/index.ts`

1. **Token exchange URL** (Zeile 69):
   - Alt: `https://api.twitter.com/2/oauth2/token`
   - Neu: `https://api.x.com/2/oauth2/token`

2. **User info URL** (Zeile 91-92):
   - Alt: `https://api.twitter.com/2/users/me?user.fields=...`
   - Neu: `https://api.x.com/2/users/me?user.fields=...`

Keine weiteren Änderungen nötig — nur die Domain-Migration.

