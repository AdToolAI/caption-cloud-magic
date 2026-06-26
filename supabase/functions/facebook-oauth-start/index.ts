import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { decryptToken } from '../_shared/crypto.ts';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

/**
 * Starts the real Meta OAuth flow for Facebook Pages.
 * Mirrors instagram-oauth-start: uses Graph API v24.0 (v18 is deprecated and
 * triggers Meta's "Feature nicht verfügbar" maintenance screen), performs a
 * best-effort grant reset, then redirects the user to facebook.com/v24.0/dialog/oauth.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "facebook-oauth-start" });


  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let returnTo: string | null = null;
    try {
      const body = await req.json();
      returnTo = body?.returnTo || null;
    } catch (_) {
      // body optional
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[facebook-oauth-start] Auth failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientId = Deno.env.get('META_APP_ID');
    if (!clientId) {
      throw new Error('META_APP_ID not configured');
    }

    console.log('[facebook-oauth-start] invoked', { user_id: user.id, hasReturnTo: !!returnTo });

    // ----- Best-effort BACKEND hard-reset of the Meta app grant -----
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
            console.log('[facebook-oauth-start] backend revoke OK via', conn.provider);
            break;
          }
        } catch (e) {
          console.warn('[facebook-oauth-start] backend revoke skip', conn.provider, e);
        }
      }

      // Purge stale fb rows so the new connection starts clean.
      await supabase
        .from('social_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'facebook');
    } catch (resetErr) {
      console.warn('[facebook-oauth-start] backend hard-reset failed (continuing):', resetErr);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;

    const csrf = crypto.randomUUID();
    const timestamp = Date.now();
    const state = btoa(JSON.stringify({
      user_id: user.id,
      provider: 'facebook',
      csrf,
      timestamp,
    }));

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
        provider: 'facebook',
        csrf_token: csrf,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        redirect_url: safeReturnTo,
      });

    if (stateError) {
      console.error('[facebook-oauth-start] State insert failed:', stateError);
      throw stateError;
    }

    // Only request scopes that are actually approved for this Meta App
    // (see Meta App Review → Permissions). Requesting un-approved scopes
    // causes Meta to short-circuit the dialog with "Feature unavailable".
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
    ].join(',');

    // Optional: Facebook Login for Business configuration ID.
    // If the Meta App was migrated to "Facebook Login for Business",
    // the legacy scope-based dialog is rejected and a `config_id` MUST
    // be sent instead. Set META_LOGIN_CONFIG_ID as a secret to enable.
    const configId = Deno.env.get('META_LOGIN_CONFIG_ID') || null;

    const authUrl = new URL('https://www.facebook.com/v24.0/dialog/oauth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    if (configId) {
      // Business Login flow — scopes are defined inside the configuration.
      authUrl.searchParams.set('config_id', configId);
    } else {
      // Classic Facebook Login — pass scopes inline.
      authUrl.searchParams.set('scope', scopes);
    }

    const finalAuthUrl = authUrl.toString();
    console.log('[facebook-oauth-start] Authorize URL built', {
      user_id: user.id,
      redirect_uri: redirectUri,
      uses_config_id: !!configId,
      scopes: configId ? null : scopes,
      url_preview: finalAuthUrl.slice(0, 200) + '…',
    });

    return new Response(
      JSON.stringify({ authUrl: finalAuthUrl, url: finalAuthUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[facebook-oauth-start] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
