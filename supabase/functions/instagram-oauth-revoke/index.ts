import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Revokes the user's Meta/Instagram permissions BEFORE we delete the local
 * social_connections row. Calling DELETE /{user-id}/permissions on the Graph
 * API tells Meta to forget the prior consent, so the next OAuth attempt
 * shows the FULL permission dialog again (instead of "Continue as ...").
 *
 * Failure of the revoke call is non-fatal — we still drop the DB row so the
 * user can always disconnect, even if their token already expired.
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

    let connectionId: string | null = null;
    try {
      const body = await req.json();
      connectionId = body?.connectionId || null;
    } catch (_) {
      // optional
    }

    // Find the IG connection (by id or by provider) — token is stored in access_token_hash
    const query = supabase
      .from('social_connections')
      .select('id, provider, access_token_hash, account_id, account_metadata')
      .eq('user_id', user.id)
      .eq('provider', 'instagram');

    const { data: connections, error: fetchErr } = connectionId
      ? await query.eq('id', connectionId).limit(1)
      : await query.limit(1);

    if (fetchErr) {
      console.error('[instagram-oauth-revoke] Lookup failed:', fetchErr);
      throw fetchErr;
    }

    const connection = connections?.[0];
    let revoked = false;
    let revokeError: string | null = null;
    let metaUserResolved = false;

    if (connection?.access_token_hash) {
      try {
        const userToken = await decryptToken(connection.access_token_hash);
        console.log('[instagram-oauth-revoke] Token decrypted successfully, length:', userToken.length);

        // Step 1: discover the Meta user id (the token owner) — required for the
        // permissions endpoint. The IG business account id won't work here.
        const meRes = await fetch(
          `https://graph.facebook.com/v24.0/me?fields=id&access_token=${encodeURIComponent(userToken)}`
        );

        if (meRes.ok) {
          const me = await meRes.json();
          const metaUserId = me?.id;
          metaUserResolved = !!metaUserId;

          if (metaUserId) {
            console.log('[instagram-oauth-revoke] Resolved Meta user id:', metaUserId);

            // Step 2: revoke ALL app permissions for this Meta user
            const revokeRes = await fetch(
              `https://graph.facebook.com/v24.0/${metaUserId}/permissions?access_token=${encodeURIComponent(userToken)}`,
              { method: 'DELETE' }
            );

            const revokeBody = await revokeRes.text();

            if (revokeRes.ok) {
              revoked = true;
              console.log('[instagram-oauth-revoke] ✅ Permissions revoked for Meta user', metaUserId, 'response:', revokeBody);
            } else {
              revokeError = `Revoke ${revokeRes.status}: ${revokeBody}`;
              console.warn('[instagram-oauth-revoke] ❌ Revoke call failed:', revokeError);
            }
          } else {
            revokeError = 'Could not resolve Meta user id from token';
            console.warn('[instagram-oauth-revoke]', revokeError);
          }
        } else {
          const meBody = await meRes.text();
          revokeError = `/me ${meRes.status}: ${meBody}`;
          console.warn('[instagram-oauth-revoke] /me call failed:', revokeError);
        }
      } catch (decryptErr) {
        revokeError = decryptErr instanceof Error ? decryptErr.message : 'decrypt failed';
        console.warn('[instagram-oauth-revoke] Could not decrypt token (continuing with DB delete):', revokeError);
      }
    } else {
      revokeError = 'No connection or access_token_hash found — skipping Meta revoke';
      console.log('[instagram-oauth-revoke]', revokeError);
    }

    // Always delete the local row, even if the Meta call failed (graceful fallback)
    let connectionDeleted = false;
    if (connection?.id) {
      const { error: deleteErr } = await supabase
        .from('social_connections')
        .delete()
        .eq('id', connection.id)
        .eq('user_id', user.id);

      if (deleteErr) {
        console.error('[instagram-oauth-revoke] DB delete failed:', deleteErr);
        throw deleteErr;
      }
      connectionDeleted = true;
    }

    return new Response(
      JSON.stringify({
        success: true,
        revoked,
        revokeError,
        connectionDeleted,
        metaUserResolved,
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
