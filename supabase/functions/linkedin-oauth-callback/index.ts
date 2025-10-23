import { createClient } from 'npm:@supabase/supabase-js@2';

// AES-GCM Encryption for tokens
async function encryptToken(plaintext: string): Promise<string> {
  const secret = Deno.env.get('ENCRYPTION_SECRET');
  if (!secret || secret.length !== 32) {
    throw new Error('ENCRYPTION_SECRET must be exactly 32 characters');
  }
  
  const keyMaterial = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  
  // Combine IV + Ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

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

    // Dual-mode: Try OpenID Connect first, fallback to Member API
    let memberId: string;
    let name: string;
    let email: string | undefined;
    let userInfo: any;

    const userInfoResponse = await fetch('https://www.linkedin.com/oauth/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    if (userInfoResponse.ok) {
      // OpenID Connect successful
      userInfo = await userInfoResponse.json();
      memberId = userInfo.sub;
      name = userInfo.name || userInfo.email?.split('@')[0] || 'LinkedIn User';
      email = userInfo.email;
      console.log(`✅ LinkedIn profile via OpenID Connect: ${name} (${memberId})`);
    } else if (userInfoResponse.status === 404) {
      // Fallback to OAuth 2.0 Member API
      console.log('⚠️ OpenID Connect not available, falling back to Member API');
      
      const [profileResponse, emailResponse] = await Promise.all([
        fetch('https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))', {
          headers: { 'Authorization': `Bearer ${access_token}` },
        }),
        fetch('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
          headers: { 'Authorization': `Bearer ${access_token}` },
        }),
      ]);

      if (!profileResponse.ok) {
        throw new Error(`Member API profile fetch failed: ${profileResponse.status}`);
      }

      const profileData = await profileResponse.json();
      memberId = profileData.id;
      
      // LinkedIn names are localized objects
      const firstNameLocalized = profileData.firstName?.localized || {};
      const lastNameLocalized = profileData.lastName?.localized || {};
      const firstNameKey = Object.keys(firstNameLocalized)[0] || 'en_US';
      const lastNameKey = Object.keys(lastNameLocalized)[0] || 'en_US';
      const firstName = firstNameLocalized[firstNameKey] || '';
      const lastName = lastNameLocalized[lastNameKey] || '';
      name = `${firstName} ${lastName}`.trim() || 'LinkedIn User';

      if (emailResponse.ok) {
        const emailData = await emailResponse.json();
        email = emailData.elements?.[0]?.['handle~']?.emailAddress;
      }

      userInfo = { id: memberId, firstName: firstNameLocalized, lastName: lastNameLocalized };
      console.log(`✅ LinkedIn profile via Member API: ${name} (${memberId})`);
    } else {
      const errorText = await userInfoResponse.text();
      console.error('❌ Failed to fetch LinkedIn user info:', userInfoResponse.status, errorText);
      throw new Error(`Failed to fetch LinkedIn user info: ${userInfoResponse.status}`);
    }

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
        account_name: name || 'LinkedIn User',
        access_token_hash: encryptedToken,
        refresh_token_hash: null,
        token_expires_at: expiresAt.toISOString(),
        scope: 'r_liteprofile r_emailaddress w_member_social',
        account_metadata: { ...userInfo, email },
        is_active: true,
        last_sync_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (insertError) {
      console.error('❌ Failed to save connection:', insertError);
      throw insertError;
    }

    console.log(`✅ LinkedIn connection saved for user ${userId}:`, {
      account_id: memberId,
      account_name: name,
      is_active: true,
    });

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
