import { createClient } from 'npm:@supabase/supabase-js@2';
import { encryptToken } from '../_shared/crypto.ts';

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
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('❌ LinkedIn OAuth error:', error, errorDescription);
      const appUrl = Deno.env.get('APP_URL') || 'https://useadtool.ai';
      return Response.redirect(`${appUrl}/performance?error=linkedin_auth_failed&message=${encodeURIComponent(errorDescription || error)}`);
    }

    if (!code || !state) {
      throw new Error('Missing code or state parameter');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify and consume CSRF state
    const stateData = JSON.parse(atob(state));
    const { data: oauthState, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .eq('provider', 'linkedin')
      .single();

    if (stateError || !oauthState) {
      throw new Error('Invalid or expired state token');
    }

    // Delete used state (prevent replay attacks)
    await supabase
      .from('oauth_states')
      .delete()
      .eq('state', state);

    const userId = stateData.user_id;

    // Exchange code for access token
    const clientId = Deno.env.get('LINKEDIN_CLIENT_ID')!;
    const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;
    const redirectUri = Deno.env.get('LINKEDIN_REDIRECT_URI')!;

    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      throw new Error(`Token exchange failed: ${JSON.stringify(errorData)}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, expires_in } = tokenData;

    // Get LinkedIn member profile (Legacy OAuth 2.0 API)
    const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new Error('Failed to fetch LinkedIn profile');
    }

    const profileData = await profileResponse.json();
    const memberId = profileData.id;
    const firstName = profileData.localizedFirstName || '';
    const lastName = profileData.localizedLastName || '';
    const name = `${firstName} ${lastName}`.trim();

    // Get email address (separate endpoint for Legacy OAuth)
    const emailResponse = await fetch('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    let email = '';
    if (emailResponse.ok) {
      const emailData = await emailResponse.json();
      email = emailData?.elements?.[0]?.['handle~']?.emailAddress || '';
    }

    console.log(`✅ LinkedIn profile fetched: ${name} (${memberId})`);

    // Encrypt access token
    const encryptedToken = await encryptToken(access_token);

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + (expires_in * 1000));

    // Upsert social_connections
    const { error: insertError } = await supabase
      .from('social_connections')
      .upsert({
        user_id: userId,
        provider: 'linkedin',
        account_id: memberId,
        account_name: name,
        access_token_hash: encryptedToken,
        token_expires_at: expiresAt.toISOString(),
        scope: 'r_liteprofile r_emailaddress w_member_social',
        account_metadata: { email },
        is_active: true,
        last_sync_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (insertError) {
      console.error('❌ Failed to save connection:', insertError);
      throw insertError;
    }

    console.log(`✅ LinkedIn connection saved for user ${userId}`);

    // Redirect to app
    const appUrl = Deno.env.get('APP_URL') || 'https://useadtool.ai';
    return Response.redirect(`${appUrl}/performance?connected=linkedin&status=success`);

  } catch (error) {
    console.error('❌ LinkedIn OAuth callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const appUrl = Deno.env.get('APP_URL') || 'https://useadtool.ai';
    return Response.redirect(`${appUrl}/performance?error=linkedin_connection_failed&message=${encodeURIComponent(errorMessage)}`);
  }
});
