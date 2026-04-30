import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

/**
 * Starts the real Meta OAuth flow for Instagram Business accounts.
 * The user is redirected to facebook.com/v24.0/dialog/oauth where they
 * see the consent dialog with all requested IG scopes. After consent,
 * Meta redirects back to oauth-callback?provider=instagram which exchanges
 * the code for a real user access token (not a master token).
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

    let returnTo: string | null = null;
    let forReview = false;
    try {
      const body = await req.json();
      returnTo = body?.returnTo || null;
      forReview = !!body?.forReview;
    } catch (_) {
      // body optional
    }

    console.log('[instagram-oauth-start] invoked', {
      forReview,
      hasReturnTo: !!returnTo,
      returnToHost: (() => { try { return returnTo ? new URL(returnTo).hostname : null; } catch { return null; } })(),
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[instagram-oauth-start] Auth failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientId = Deno.env.get('META_APP_ID');
    if (!clientId) {
      throw new Error('META_APP_ID not configured');
    }

    // ----- Best-effort BACKEND hard-reset of the Meta app grant -----
    // Safety net in case the frontend skipped the explicit revoke call.
    // Meta otherwise short-circuits the consent dialog with the
    // "You previously logged into ..." screen, which is exactly what
    // we are trying to avoid for Instagram reconnects.
    try {
      const { data: metaConnections } = await supabase
        .from('social_connections')
        .select('id, provider, access_token_hash')
        .eq('user_id', user.id)
        .in('provider', ['instagram', 'facebook']);

      for (const conn of metaConnections ?? []) {
        if (!conn.access_token_hash) continue;
        try {
          const userToken = await decryptToken(conn.access_token_hash);
          const meRes = await fetch(
            `https://graph.facebook.com/v24.0/me?fields=id&access_token=${encodeURIComponent(userToken)}`
          );
          if (!meRes.ok) continue;
          const me = await meRes.json();
          const metaUserId = me?.id;
          if (!metaUserId) continue;
          const revokeRes = await fetch(
            `https://graph.facebook.com/v24.0/${metaUserId}/permissions?access_token=${encodeURIComponent(userToken)}`,
            { method: 'DELETE' }
          );
          if (revokeRes.ok) {
            console.log('[instagram-oauth-start] backend revoke OK via', conn.provider);
            break;
          }
        } catch (e) {
          console.warn('[instagram-oauth-start] backend revoke skip', conn.provider, e);
        }
      }

      // Always purge stale ig + fb rows so the new connection starts clean.
      await supabase
        .from('social_connections')
        .delete()
        .eq('user_id', user.id)
        .in('provider', ['instagram', 'facebook']);
    } catch (resetErr) {
      console.warn('[instagram-oauth-start] backend hard-reset failed (continuing):', resetErr);
    }

    // Use the same callback path as Facebook (already registered in Meta App settings)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;

    // CSRF + state — same shape oauth-callback expects (base64 JSON)
    const csrf = crypto.randomUUID();
    const timestamp = Date.now();
    const state = btoa(JSON.stringify({
      user_id: user.id,
      provider: 'instagram',
      csrf,
      timestamp,
    }));

    // Validate returnTo
    let safeReturnTo: string | null = null;
    if (returnTo) {
      try {
        const parsed = new URL(returnTo);
        if (parsed.protocol === 'https:') {
          safeReturnTo = returnTo;
        }
      } catch (_) {
        // ignore
      }
    }

    const { error: stateError } = await supabase
      .from('oauth_states')
      .insert({
        user_id: user.id,
        provider: 'instagram',
        csrf_token: csrf,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        redirect_url: safeReturnTo,
      });

    if (stateError) {
      console.error('[instagram-oauth-start] State insert failed:', stateError);
      throw stateError;
    }

    // Instagram Business Login via Facebook OAuth — these are the scopes Meta expects
    // for instagram_basic + instagram_content_publish review.
    const scopes = [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
    ].join(',');

    const authUrl = new URL('https://www.facebook.com/v24.0/dialog/oauth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);
    // Push Meta into the CONSENT path (not the login/identity path).
    //   - `rerequest`: forces Meta to show the permission selection dialog
    //     instead of falling back to the cached "Continue as ..." short-circuit.
    //   - fresh `auth_nonce`: bypasses Meta's session cache.
    //   - `display=page`: full-page consent UX (Meta App Review screencast).
    // We deliberately do NOT use `reauthenticate` here — that only forces a
    // password re-entry, but Meta still skips the scope dialog if it remembers
    // the app grant. The matching hard-reset in instagram-oauth-revoke is what
    // makes `rerequest` actually surface the consent screen again.
    authUrl.searchParams.set('auth_type', 'rerequest');
    authUrl.searchParams.set('auth_nonce', crypto.randomUUID().replace(/-/g, ''));
    authUrl.searchParams.set('display', 'page');

    const finalAuthUrl = authUrl.toString();
    console.log('[instagram-oauth-start] Authorize URL built', {
      user_id: user.id,
      forReview,
      auth_type: authUrl.searchParams.get('auth_type'),
      display: authUrl.searchParams.get('display'),
      has_nonce: !!authUrl.searchParams.get('auth_nonce'),
      url_preview: finalAuthUrl.slice(0, 140) + '…',
    });

    return new Response(
      JSON.stringify({ authUrl: finalAuthUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[instagram-oauth-start] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
