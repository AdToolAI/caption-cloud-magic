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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let state: string | null = null;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    state = url.searchParams.get('state');

    if (!code || !state) {
      throw new Error('Fehlende OAuth-Parameter (code/state)');
    }

    // Verify state and get code_verifier
    const { data: oauthState, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('csrf_token', state)
      .eq('provider', 'x')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !oauthState) {
      throw new Error('Ungültiger oder abgelaufener OAuth-State. Bitte erneut verbinden.');
    }

    // Check if user has Enterprise plan (X/Twitter access)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', oauthState.user_id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      throw new Error('Fehler beim Abrufen des Benutzerprofils');
    }

    if (profile?.plan !== 'enterprise') {
      console.log('User does not have Enterprise plan:', profile?.plan);
      throw new Error('X/Twitter ist nur für Enterprise-Kunden verfügbar. Bitte upgrade deinen Plan.');
    }

    const codeVerifier = await decryptToken(oauthState.code_verifier);

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.x.com/2/oauth2/token', {
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
      console.error('Token exchange error:', JSON.stringify(tokenData));
      throw new Error(`Token-Austausch fehlgeschlagen: ${tokenData.error_description || tokenData.error || 'Unbekannter Fehler'}`);
    }

    // Fetch user info
    const userResponse = await fetch(
      'https://api.x.com/2/users/me?user.fields=name,username,profile_image_url',
      {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      }
    );

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error('User fetch error:', JSON.stringify(userData));
      
      // Detect specific X API enrollment/access errors
      const reason = userData?.reason || '';
      const detail = userData?.detail || '';
      const title = userData?.title || '';
      const errorMessages = userData?.errors?.map((e: any) => e.message).join('; ') || '';
      
      const isEnrollmentError = 
        reason.includes('client-not-enrolled') ||
        detail.includes('client-not-enrolled') ||
        title.includes('Forbidden') ||
        detail.includes('Appropriate Level of API Access') ||
        errorMessages.includes('client-not-enrolled');
      
      if (isEnrollmentError) {
        throw new Error(
          'X API Zugriff verweigert: Die X-App ist nicht korrekt konfiguriert. ' +
          'Bitte stelle im X Developer Portal (developer.x.com) sicher, dass die App ' +
          'einem Projekt zugeordnet ist und mindestens "Basic" API-Zugang hat.'
        );
      }
      
      throw new Error(`X Profilabruf fehlgeschlagen: ${detail || title || errorMessages || 'Unbekannter Fehler'}`);
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

    // Clean up oauth state on success
    await supabase.from('oauth_states').delete().eq('csrf_token', state);

    // Redirect to app
    const redirectUrl = `${Deno.env.get('APP_BASE_URL')}/performance?tab=connections&provider=x&status=success`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': redirectUrl },
    });
  } catch (error) {
    console.error('X OAuth callback error:', error);
    
    // Clean up oauth state on failure too
    if (state) {
      try {
        await supabase.from('oauth_states').delete().eq('csrf_token', state);
      } catch (_) {
        // ignore cleanup errors
      }
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const redirectUrl = `${Deno.env.get('APP_BASE_URL')}/performance?tab=connections&provider=x&status=error&message=${encodeURIComponent(errorMessage)}`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': redirectUrl },
    });
  }
});
