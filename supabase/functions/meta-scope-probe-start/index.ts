// meta-scope-probe-start
//
// Diagnostic only: starts a Meta dialog that requests EXACTLY ONE scope
// (business_management) with auth_type=rerequest. It never touches
// social_connections, never revokes an existing grant and never stores a
// token. The result is written to meta_oauth_diagnostics under the provider
// key `facebook_scope_probe`, so the normal connect history stays clean.
//
// Purpose: distinguish "Meta refuses this scope for this profile" from
// "the scope is only missing in combination with the other page scopes".

import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { recordOAuthStart } from '../_shared/meta-oauth-diagnostics.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROVIDER = 'facebook_scope_probe';
const PROBE_SCOPE = 'business_management';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let forceAccountChooser = false;
    try {
      const body = await req.json();
      forceAccountChooser = !!body?.forceAccountChooser;
    } catch (_) {
      /* body optional */
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = Deno.env.get('META_APP_ID');
    if (!clientId) throw new Error('META_APP_ID not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;

    const csrf = crypto.randomUUID();
    const state = btoa(JSON.stringify({
      user_id: user.id,
      provider: PROVIDER,
      csrf,
      timestamp: Date.now(),
    }));

    const { error: stateError } = await supabase.from('oauth_states').insert({
      user_id: user.id,
      provider: PROVIDER,
      csrf_token: csrf,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) throw stateError;

    const authUrl = new URL('https://www.facebook.com/v24.0/dialog/oauth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', PROBE_SCOPE);
    authUrl.searchParams.set('auth_type', 'rerequest');

    const dialogUrl = authUrl.toString();
    const finalUrl = forceAccountChooser
      ? `https://www.facebook.com/login.php?next=${encodeURIComponent(dialogUrl)}`
      : dialogUrl;

    await recordOAuthStart(supabase, {
      userId: user.id,
      provider: PROVIDER,
      stateKey: csrf,
      requestedScopes: [PROBE_SCOPE],
      dialogUrl: finalUrl,
      usesConfigId: false,
      authType: 'rerequest',
    });

    console.log('[meta-scope-probe-start] dialog built', {
      user_id: user.id,
      scope: PROBE_SCOPE,
      force_account_chooser: forceAccountChooser,
    });

    return new Response(JSON.stringify({ authUrl: finalUrl, url: finalUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[meta-scope-probe-start] error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
