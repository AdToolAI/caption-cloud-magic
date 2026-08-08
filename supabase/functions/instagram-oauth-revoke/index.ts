import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { decryptToken } from '../_shared/crypto.ts';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

/**
 * Performs a HARD RESET of the Meta app authorization:
 *
 *   1. Tries to call DELETE /{meta-user-id}/permissions on the Graph API for
 *      every Meta-related token we still have (instagram + facebook), so Meta
 *      forgets the previous consent.
 *   2. Deletes BOTH `instagram` and `facebook` rows from social_connections —
 *      Meta treats them as one shared app grant, so a partial cleanup is what
 *      keeps showing the "You previously logged into ..." short-circuit screen
 *      on reconnect.
 *
 * Response shape (used by the frontend to decide whether to warn the user):
 *   {
 *     success: true,
 *     revoked: boolean,            // ANY meta revoke succeeded
 *     revokeError: string | null,
 *     deletedProviders: string[],  // which DB rows were actually removed
 *     hardResetComplete: boolean,  // revoke + DB cleanup both succeeded
 *     metaUserResolved: boolean,
 *   }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "instagram-oauth-revoke" });


  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optional: connectionId is no longer required — we always do a hard reset
    // across all Meta providers. We still accept it for backwards compat / logs.
    let connectionId: string | null = null;
    try {
      const body = await req.json();
      connectionId = body?.connectionId || null;
    } catch (_) {
      // optional
    }

    console.log('[instagram-oauth-revoke] HARD RESET requested for user', user.id, { connectionId });

    // Pull EVERY Meta-related connection (ig + fb) for this user
    const { data: metaConnections, error: fetchErr } = await supabase
      .from('social_connections')
      .select('id, provider, access_token_hash, account_id, account_metadata')
      .eq('user_id', user.id)
      .in('provider', ['instagram', 'facebook']);

    if (fetchErr) {
      console.error('[instagram-oauth-revoke] Lookup failed:', fetchErr);
      throw fetchErr;
    }

    let revoked = false;
    let revokeError: string | null = null;
    let metaUserResolved = false;
    let lastUserToken: string | null = null;
    let resolvedMetaUserId: string | null = null;
    let grantAlreadyCleared = false;

    const appId = Deno.env.get('META_APP_ID');
    const appSecret = Deno.env.get('META_APP_SECRET');
    if (!appId || !appSecret) {
      throw new Error('Meta app credentials are not configured');
    }
    const appAccessToken = `${appId}|${appSecret}`;

    const debugToken = async (inputToken: string) => {
      const response = await fetch(
        `https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(appAccessToken)}`
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.error) {
        const message = body?.error?.message || `Meta ${response.status}`;
        throw new Error(message);
      }
      return body?.data ?? null;
    };

    /** Turn a Graph API error body into one short readable line. */
    const shortGraphError = (status: number, body: string): string => {
      try {
        const parsed = JSON.parse(body);
        const err = parsed?.error;
        if (err?.message) {
          const code = err.code ? ` (#${err.code})` : '';
          return `Meta ${status}${code}: ${String(err.message).split('.')[0]}`;
        }
      } catch (_) {
        // not JSON — fall through
      }
      return `Meta ${status}`;
    };

    // Facebook rows should hold the USER access token; Instagram rows normally
    // hold a PAGE token. Prove the token type with debug_token before revoking.
    const ordered = [...(metaConnections ?? [])].sort((a, b) =>
      a.provider === 'facebook' ? -1 : b.provider === 'facebook' ? 1 : 0
    );

    for (const connection of ordered) {
      if (!connection.access_token_hash) continue;
      try {
        const userToken = await decryptToken(connection.access_token_hash);
        console.log(
          '[instagram-oauth-revoke] Attempting revoke via',
          connection.provider,
          'token (len:', userToken.length, ')'
        );

        const tokenInfo = await debugToken(userToken);
        const tokenType = String(tokenInfo?.type ?? '').toUpperCase();
        const tokenUserId = tokenInfo?.user_id ? String(tokenInfo.user_id) : null;
        console.log('[instagram-oauth-revoke] Token inspected', {
          provider: connection.provider,
          type: tokenType || 'unknown',
          is_valid: tokenInfo?.is_valid === true,
          has_user_id: !!tokenUserId,
        });

        if (tokenInfo?.is_valid === false && connection.provider === 'facebook') {
          lastUserToken = userToken;
          resolvedMetaUserId = tokenUserId;
          grantAlreadyCleared = true;
          console.log('[instagram-oauth-revoke] Stored Facebook user token is already invalid; grant is cleared');
          break;
        }

        if (tokenInfo?.is_valid !== true || tokenType !== 'USER' || !tokenUserId) {
          console.log('[instagram-oauth-revoke] Skipping non-user or invalid token', connection.provider);
          continue;
        }
        const storedMetaUserId =
          (connection.account_metadata as Record<string, unknown> | null)?.meta_user_id as
            | string
            | undefined;
        metaUserResolved = true;
        lastUserToken = userToken;
        resolvedMetaUserId = tokenUserId;
        console.log('[instagram-oauth-revoke] Resolved Meta user token', {
          provider: connection.provider,
          stored_id_matches: !storedMetaUserId || storedMetaUserId === tokenUserId,
        });

        // /me is bound to the confirmed user token and avoids accidentally
        // targeting a Page ID from stale connection metadata.
        const revokeRes = await fetch(
          `https://graph.facebook.com/v24.0/me/permissions?access_token=${encodeURIComponent(userToken)}`,
          { method: 'DELETE' }
        );
        const revokeBody = await revokeRes.text();
        let revokePayload: { success?: boolean } | null = null;
        try {
          revokePayload = revokeBody ? JSON.parse(revokeBody) : null;
        } catch (_) {
          revokePayload = null;
        }

        if (revokeRes.ok && revokePayload?.success === true) {
          revoked = true;
          revokeError = null;
          console.log('[instagram-oauth-revoke] Permissions revoked via', connection.provider);
          break; // one successful revoke is enough — Meta drops the whole app grant
        } else {
          revokeError = revokeRes.ok
            ? 'Meta did not confirm the permission reset'
            : shortGraphError(revokeRes.status, revokeBody);
          console.warn(
            '[instagram-oauth-revoke] ❌ Revoke call failed via',
            connection.provider,
            ':',
            revokeBody
          );
        }
      } catch (decryptErr) {
        const msg = decryptErr instanceof Error ? decryptErr.message : 'decrypt failed';
        revokeError = msg;
        console.warn(
          '[instagram-oauth-revoke] Could not decrypt/use token for',
          connection.provider,
          '(continuing):',
          msg
        );
      }
    }


    // Verify with Meta that the app grant is really gone. If the token still
    // debugs as valid with scopes, Meta will short-circuit the next consent
    // dialog ("Continue as ...") — which breaks the App Review recording.
    // authorization_cleared === true  → next connect shows the FULL dialog.
    let authorizationCleared: boolean | null = null;
    let remainingScopes: string[] = [];
    try {
      if (lastUserToken) {
        const info = await debugToken(lastUserToken);
        remainingScopes = Array.isArray(info?.scopes) ? info.scopes : [];
        authorizationCleared = info?.is_valid === false || remainingScopes.length === 0;
      }
    } catch (verifyErr) {
      console.warn('[instagram-oauth-revoke] debug_token verification failed:', verifyErr);
    }

    // Preserve the local token if Meta did not confirm that the grant is gone.
    // It is needed for a retry and prevents the UI from claiming a clean reset.
    const deletedProviders: string[] = [];
    if ((revoked || grantAlreadyCleared) && authorizationCleared === true) {
      for (const provider of ['instagram', 'facebook'] as const) {
        const { data: deleted, error: deleteErr } = await supabase
          .from('social_connections')
          .delete()
          .eq('user_id', user.id)
          .eq('provider', provider)
          .select('id');

        if (deleteErr) {
          console.error('[instagram-oauth-revoke] DB delete failed for', provider, ':', deleteErr);
          continue;
        }
        if (deleted && deleted.length > 0) deletedProviders.push(provider);
      }
    }

    const hardResetComplete = (revoked || grantAlreadyCleared) && authorizationCleared === true;

    console.log('[instagram-oauth-revoke] Hard reset summary:', {
      user_id: user.id,
      revoked,
      revokeError,
      deletedProviders,
      hardResetComplete,
      metaUserResolved,
      authorizationCleared,
      remainingScopeCount: remainingScopes.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        revoked,
        revokeError,
        deletedProviders,
        hardResetComplete,
        metaUserResolved,
        meta_user_id: resolvedMetaUserId,
        authorization_cleared: authorizationCleared,
        remaining_scopes: remainingScopes,
        // backwards-compat for older frontend code
        connectionDeleted: deletedProviders.length > 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[instagram-oauth-revoke] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
