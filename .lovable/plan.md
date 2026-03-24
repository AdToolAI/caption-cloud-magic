
Do I know what the issue is? Yes.

What I verified:
- The X OAuth start step works: new `oauth_states` rows are created for your user on every attempt.
- The X callback still fails before saving the account.
- There is currently no `social_connections` row for provider `x`, so the UI has nothing to mark as connected.
- Latest backend log shows the real blocker:
  `Client Forbidden / reason: client-not-enrolled`
  during the `GET /2/users/me` call in `supabase/functions/x-oauth-callback/index.ts`.

What the problem actually is:
- The app is not failing at the UI layer.
- It is failing in the backend callback after X sends the user back successfully.
- The access token is obtained, but X rejects that token for v2 user lookup, so the app never reaches the `social_connections.upsert(...)`.
- That means “not connected” is currently correct: the connection is never persisted.

Most important implication:
- The active X credentials being used by the backend are the ones X is rejecting.
- So even if you already attached an app to a project in the portal, the credentials currently configured in the app still appear to belong to an app/access setup that X does not accept for `/2/users/me`.

Implementation plan:
1. Improve `supabase/functions/x-oauth-callback/index.ts`
   - Detect X errors using `userData.reason`, `required_enrollment`, and `client_id` instead of only `detail`.
   - Return a much clearer message such as:
     “Die aktuell hinterlegten X-App-Credentials werden von X für v2 abgelehnt.”
   - Clean up `oauth_states` on both success and failure so old attempts don’t pile up.

2. Tighten success handling in `src/components/performance/ConnectionsTab.tsx`
   - Only show “connected” if a fresh `social_connections` row for `x` actually exists after redirect.
   - If the callback returns `status=error`, surface that exact message immediately and avoid any optimistic success state.

3. Add clearer inline diagnostics to the X card
   - Update `src/components/performance/XConnectionCard.tsx` so failed callbacks are visible directly on the card, not only as a toast.
   - Show a short provider-specific hint that the backend X app/access is being rejected by X.

4. Preserve proof of the real failure
   - Keep the raw sanitized X failure reason in logs and expose a user-safe version in the UI.
   - This will make it obvious whether the blocker is:
     - wrong app credentials
     - app not actually attached to the correct project
     - missing API access tier
     - another X-side enrollment restriction

5. Validate after implementation
   - Success path: callback creates a `social_connections` row and X immediately shows as connected.
   - Failure path: the UI explicitly says X rejected the configured app credentials, instead of just staying disconnected.

Technical note:
- No database migration is needed.
- The core issue is not the card rendering or source-of-truth logic anymore.
- The real blocker is the X API response in the callback.
- The only code gap left is that the app still does not explain this clearly enough in the UI, and it should verify persistence before claiming success.
