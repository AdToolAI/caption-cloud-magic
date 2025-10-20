import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptToken, decryptToken } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      throw new Error('Missing code or state');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify state and get code_verifier
    const { data: oauthState, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .eq('provider', 'x')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !oauthState) {
      throw new Error('Invalid or expired state');
    }

    const codeVerifier = await decryptToken(oauthState.code_verifier);

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${Deno.env.get('X_CLIENT_ID')}:${Deno.env.get('X_CLIENT_SECRET')}`)}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: Deno.env.get('X_REDIRECT_URI')!,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange error:', tokenData);
      throw new Error(tokenData.error_description || 'Token exchange failed');
    }

    // Fetch user info
    const userResponse = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=name,username,profile_image_url',
      {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      }
    );

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error('User fetch error:', userData);
      throw new Error('Failed to fetch user data');
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store connection
    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .upsert({
        user_id: oauthState.user_id,
        provider: 'x',
        account_id: userData.data.id,
        account_name: `@${userData.data.username}`,
        access_token_hash: await encryptToken(tokenData.access_token),
        refresh_token_hash: tokenData.refresh_token ? await encryptToken(tokenData.refresh_token) : null,
        token_expires_at: expiresAt.toISOString(),
        account_metadata: {
          username: userData.data.username,
          name: userData.data.name,
          profile_image_url: userData.data.profile_image_url,
        },
      })
      .select()
      .single();

    if (connectionError) throw connectionError;

    // Clean up oauth state
    await supabase.from('oauth_states').delete().eq('state', state);

    // Redirect to app
    const redirectUrl = `${Deno.env.get('APP_BASE_URL')}/performance?provider=x&status=success`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': redirectUrl },
    });
  } catch (error) {
    console.error('X OAuth callback error:', error);
    const redirectUrl = `${Deno.env.get('APP_BASE_URL')}/performance?provider=x&status=error&message=${encodeURIComponent(error.message)}`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': redirectUrl },
    });
  }
});
