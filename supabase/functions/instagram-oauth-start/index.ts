import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    // Force the full permission dialog (all scopes visible) instead of "Continue as ..." re-login screen.
    // Required for Meta App Review screencast.
    authUrl.searchParams.set('auth_type', 'rerequest');
    authUrl.searchParams.set('display', 'page');

    console.log('[instagram-oauth-start] Authorize URL built for user', user.id);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
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
