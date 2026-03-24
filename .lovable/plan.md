

## Problem

Zwei Fehler in `x-oauth-callback/index.ts`:

1. **Crash in Error-Handler (Zeile 159)**: `supabase.from(...).delete(...).eq(...).catch()` ist kein gültiger Aufruf — der Supabase Query Builder gibt kein thenable mit `.catch()` zurück. Das führt zum `TypeError` und zum **"Internal Server Error"** statt einer sauberen Redirect-Antwort.

2. **X API Enrollment-Fehler**: Die X-App-Credentials werden weiterhin von X abgelehnt (`client-not-enrolled`). Das ist ein externes Konfigurationsproblem — aber der User sieht es nicht, weil Fehler 1 den Redirect verhindert.

## Changes

### File: `supabase/functions/x-oauth-callback/index.ts`

**Fix the `.catch()` crash** (Zeile 157-160):

Replace the broken `.catch()` pattern with a proper try/catch:

```typescript
// Clean up oauth state on failure too
if (state) {
  try {
    await supabase.from('oauth_states').delete().eq('csrf_token', state);
  } catch (_) {
    // ignore cleanup errors
  }
}
```

Also fix the same pattern on the success path (around line 145) if it uses the same `.catch()` syntax.

This single fix will ensure that instead of "Internal Server Error", the user gets properly redirected back to `/performance?provider=x&status=error&message=...` with the real X API error message visible.

## What the user will see after this fix

Instead of "Internal Server Error", they will be redirected back to the app with a clear error message explaining that the X Developer Portal app needs to be attached to a Project with at least "Basic" API access.

