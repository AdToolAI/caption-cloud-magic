
Do I know what the issue is? Yes.

What I verified
- X is still not actually connected: there is no `social_connections` row for `provider = 'x'`.
- The latest backend log from `x-oauth-callback` still shows the real blocker:
  `Client Forbidden` / `reason: client-not-enrolled` / `required_enrollment: Appropriate Level of API Access`.
- The secrets exist and `health-x` returns `ok: true`, so this is not a missing API key problem.
- The current code still has two UX gaps:
  1. `x-oauth-callback` always redirects to `APP_BASE_URL`, so if the flow starts from Preview and returns to Published (or vice versa), the user can miss the result.
  2. `ConnectionsTab` clears the query params immediately after toast handling, while `XConnectionCard` separately tries to read the same params. That makes the inline error fragile.

What the actual problem is
- The true connection failure is external: the configured X app is being rejected by X itself for v2 access.
- The app-side bug is that the failure is not shown reliably in the same environment where the user started the flow.

Implementation plan
1. Make the callback return to the exact origin that started the flow
   - Update `supabase/functions/x-oauth-start/index.ts` to accept/store a safe `returnTo` target in `oauth_states.state`.
   - Update `src/components/performance/XConnectionCard.tsx` to send the current `/performance?tab=connections` URL when starting OAuth.
   - Update `supabase/functions/x-oauth-callback/index.ts` to read that stored return target, validate it, and redirect there instead of always using `APP_BASE_URL`.

2. Centralize callback status handling in one place
   - Move X callback parsing out of `XConnectionCard` and let `ConnectionsTab` become the single source of truth for `provider/status/message`.
   - Pass the resolved X error/success state into `XConnectionCard` as props instead of making the card read `window.location.search` itself.
   - Remove the race where params are cleared before the card can show the banner.

3. Only show success if the X row really exists
   - In `src/components/performance/ConnectionsTab.tsx`, after `status=success`, re-fetch `social_connections` and verify a fresh `provider='x'` row exists before showing “connected”.
   - If the row is missing, downgrade to an error state and show a clear message instead of optimistic success.

4. Sharpen the X-specific diagnostic message
   - Keep the raw X reason in backend logs.
   - Surface a shorter user-safe inline message on the X card, e.g.:
     “X hat die aktuell hinterlegte App abgelehnt. Die App muss in X Developer korrekt einem Project zugeordnet sein und den nötigen API-Zugang haben.”
   - Preserve the detailed backend message for debugging.

5. Harden callback cleanup and fallback behavior
   - In `x-oauth-callback`, delete `oauth_states` via the loaded row id (`oauthState.id`) and log cleanup failures explicitly.
   - Add a safe fallback to `APP_BASE_URL` only if no valid stored return URL exists.

Technical notes
- No database migration is needed; `oauth_states.state` already exists and can hold the return target metadata.
- The code changes will fix the “I still don’t see the error” problem.
- They will not by themselves make X connect until the X app credentials are valid for X v2 access; the current backend evidence still points to `client-not-enrolled`.
