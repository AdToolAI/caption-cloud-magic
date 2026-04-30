import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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
      .select('id, provider, access_token_hash, account_id')
      .eq('user_id', user.id)
      .in('provider', ['instagram', 'facebook']);

    if (fetchErr) {
      console.error('[instagram-oauth-revoke] Lookup failed:', fetchErr);
      throw fetchErr;
    }

    let revoked = false;
    let revokeError: string | null = null;
    let metaUserResolved = false;

    // Try to revoke via Meta using whichever token still works
    for (const connection of metaConnections ?? []) {
      if (!connection.access_token_hash) continue;
      try {
        const userToken = await decryptToken(connection.access_token_hash);
        console.log(
          '[instagram-oauth-revoke] Attempting revoke via',
          connection.provider,
          'token (len:', userToken.length, ')'
        );

        const meRes = await fetch(
          `https://graph.facebook.com/v24.0/me?fields=id&access_token=${encodeURIComponent(userToken)}`
        );

        if (!meRes.ok) {
          const meBody = await meRes.text();
          revokeError = `/me ${meRes.status}: ${meBody}`;
          console.warn('[instagram-oauth-revoke] /me failed for', connection.provider, ':', revokeError);
          continue;
        }

        const me = await meRes.json();
        const metaUserId = me?.id;
        if (!metaUserId) {
          revokeError = 'Meta /me returned no id';
          console.warn('[instagram-oauth-revoke]', revokeError);
          continue;
        }
        metaUserResolved = true;
        console.log('[instagram-oauth-revoke] Resolved Meta user id:', metaUserId, 'via', connection.provider);

        const revokeRes = await fetch(
          `https://graph.facebook.com/v24.0/${metaUserId}/permissions?access_token=${encodeURIComponent(userToken)}`,
          { method: 'DELETE' }
        );
        const revokeBody = await revokeRes.text();

        if (revokeRes.ok) {
          revoked = true;
          revokeError = null;
          console.log(
            '[instagram-oauth-revoke] ✅ Permissions revoked for Meta user',
            metaUserId,
            'via',
            connection.provider,
            'response:',
            revokeBody
          );
          break; // one successful revoke is enough — Meta drops the whole app grant
        } else {
          revokeError = `Revoke ${revokeRes.status}: ${revokeBody}`;
          console.warn(
            '[instagram-oauth-revoke] ❌ Revoke call failed via',
            connection.provider,
            ':',
            revokeError
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

    // Always delete BOTH instagram and facebook rows for this user.
    // Meta sees them as a shared app grant; keeping fb around is what causes
    // the "Continue as ..." short-circuit on Instagram reconnect.
    const deletedProviders: string[] = [];
    for (const provider of ['instagram', 'facebook'] as const) {
      const { data: deleted, error: deleteErr } = await supabase
        .from('social_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', provider)
        .select('id');

      if (deleteErr) {
        console.error('[instagram-oauth-revoke] DB delete failed for', provider, ':', deleteErr);
        // Don't throw — keep going so we delete what we can.
        continue;
      }
      if (deleted && deleted.length > 0) {
        deletedProviders.push(provider);
      }
    }

    const hardResetComplete = revoked && deletedProviders.length > 0;
    console.log('[instagram-oauth-revoke] Hard reset summary:', {
      user_id: user.id,
      revoked,
      revokeError,
      deletedProviders,
      hardResetComplete,
      metaUserResolved,
    });

    return new Response(
      JSON.stringify({
        success: true,
        revoked,
        revokeError,
        deletedProviders,
        hardResetComplete,
        metaUserResolved,
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
