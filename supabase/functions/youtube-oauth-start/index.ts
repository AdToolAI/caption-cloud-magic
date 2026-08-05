import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'YouTube ist serverseitig nicht konfiguriert (GOOGLE_CLIENT_ID fehlt).' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Nicht authentifiziert - Authorization Header fehlt' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let returnTo: string | null = null;
    try {
      const body = await req.json();
      returnTo = body?.returnTo ?? null;
    } catch (_) {
      // no body is fine
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Nicht authentifiziert - Bitte neu anmelden' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let safeReturnTo: string | null = null;
    if (returnTo) {
      try {
        const parsed = new URL(returnTo);
        if (parsed.protocol === 'https:') safeReturnTo = returnTo;
      } catch (_) {
        // ignore invalid return targets
      }
    }

    const csrf = crypto.randomUUID();
    const timestamp = Date.now();

    const { error: stateError } = await supabase.from('oauth_states').insert({
      user_id: user.id,
      provider: 'youtube',
      csrf_token: csrf,
      expires_at: new Date(timestamp + 300_000).toISOString(),
      ...(safeReturnTo ? { return_to: safeReturnTo } : {}),
    });

    if (stateError) {
      console.error('[youtube-oauth-start] failed to store state:', stateError);
      return new Response(
        JSON.stringify({ error: 'Verbindung konnte nicht gestartet werden' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const state = btoa(JSON.stringify({
      user_id: user.id,
      provider: 'youtube',
      csrf,
      timestamp,
    }));

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback?provider=youtube`;

    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
      + `?client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + '&response_type=code'
      + `&scope=${encodeURIComponent(SCOPES)}`
      + '&access_type=offline'
      + '&include_granted_scopes=true'
      + '&prompt=consent'
      + `&state=${encodeURIComponent(state)}`;

    console.log('[youtube-oauth-start] auth url built for user', user.id);

    return new Response(
      JSON.stringify({ authUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[youtube-oauth-start] unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
