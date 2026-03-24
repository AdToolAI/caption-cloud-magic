import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate PKCE challenge
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract return URL and auth header
    const authHeader = req.headers.get('Authorization');
    let returnTo: string | null = null;
    try {
      const body = await req.json();
      returnTo = body?.returnTo || null;
    } catch (_) {
      // no body is fine
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Try to get user from token
    let user;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !authUser) {
        console.error('Authentication failed:', authError);
        return new Response(
          JSON.stringify({ 
            error: 'Nicht authentifiziert - Bitte neu anmelden',
            details: authError?.message 
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      user = authUser;
    } else {
      return new Response(
        JSON.stringify({ error: 'Nicht authentifiziert - Authorization Header fehlt' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has Enterprise plan (X/Twitter access)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Fehler beim Abrufen des Profils' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (profile?.plan !== 'enterprise') {
      console.log('User does not have Enterprise plan:', profile?.plan);
      return new Response(
        JSON.stringify({ 
          error: 'X/Twitter Integration ist nur für Enterprise-Kunden verfügbar',
          upgrade_required: true 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = crypto.randomUUID();

    // Store PKCE and state
    const { error: stateError } = await supabase
      .from('oauth_states')
      .insert({
        csrf_token: state,
        user_id: user.id,
        provider: 'x',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        code_verifier: await encryptToken(codeVerifier),
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      });

    if (stateError) throw stateError;

    const clientId = Deno.env.get('X_CLIENT_ID');
    const redirectUri = Deno.env.get('X_REDIRECT_URI');

    const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId!);
    authUrl.searchParams.set('redirect_uri', redirectUri!);
    authUrl.searchParams.set('scope', 'tweet.read tweet.write users.read offline.access');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('X OAuth start error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
