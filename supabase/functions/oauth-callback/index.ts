import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    if (!provider || !code) {
      throw new Error('Missing provider or authorization code');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Decode and validate state parameter
    let stateData;
    try {
      stateData = JSON.parse(atob(state || ''));
    } catch (e) {
      throw new Error('Invalid state parameter');
    }

    const { user_id: userId, csrf, timestamp } = stateData;

    if (!userId || !csrf || !timestamp) {
      throw new Error('Invalid state format');
    }

    // Check state timestamp (max 5 minutes old)
    const stateAge = Date.now() - timestamp;
    if (stateAge > 300000) {
      throw new Error('OAuth state expired');
    }

    // Verify CSRF token against stored state
    const { data: storedState, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('user_id', userId)
      .eq('csrf_token', csrf)
      .eq('provider', provider)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (stateError || !storedState) {
      console.error('CSRF validation failed:', stateError);
      throw new Error('Invalid or expired OAuth state');
    }

    // Delete used state to prevent replay attacks
    await supabase
      .from('oauth_states')
      .delete()
      .eq('id', storedState.id);

    let tokenData;
    let accountInfo;

    switch (provider) {
      case 'instagram':
      case 'facebook':
        tokenData = await exchangeMetaToken(code);
        accountInfo = await getMetaAccountInfo(tokenData.access_token, provider);
        break;
      case 'tiktok':
        tokenData = await exchangeTikTokToken(code);
        accountInfo = await getTikTokAccountInfo(tokenData.access_token);
        break;
      case 'linkedin':
        tokenData = await exchangeLinkedInToken(code);
        accountInfo = await getLinkedInAccountInfo(tokenData.access_token);
        break;
      case 'x':
        tokenData = await exchangeXToken(code);
        accountInfo = await getXAccountInfo(tokenData.access_token);
        break;
      case 'youtube':
        tokenData = await exchangeYouTubeToken(code);
        accountInfo = await getYouTubeAccountInfo(tokenData.access_token);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Encode tokens with Base64 for secure storage
    const encodeToken = (token: string | null) => {
      if (!token) return null;
      return btoa(token);
    };

    const accessTokenHash = encodeToken(tokenData.access_token);
    const refreshTokenHash = encodeToken(tokenData.refresh_token);

    // For Facebook, use Page Access Token instead of User Access Token
    const finalAccessToken = provider === 'facebook' && (accountInfo as any).access_token 
      ? (accountInfo as any).access_token 
      : tokenData.access_token;
    
    const finalAccessTokenHash = encodeToken(finalAccessToken);
    
    // Store connection with audit trail and account metadata
    const { error: upsertError } = await supabase
      .from('social_connections')
      .upsert({
        user_id: userId,
        provider,
        account_id: accountInfo.id,
        account_name: accountInfo.name,
        access_token_hash: finalAccessTokenHash,
        refresh_token_hash: refreshTokenHash,
        token_expires_at: tokenData.expires_at,
        auto_sync_enabled: true,
        last_sync_at: null,
        account_metadata: (accountInfo as any).account_type ? { account_type: (accountInfo as any).account_type } : {}
      }, {
        onConflict: 'user_id,provider,account_id'
      });

    if (upsertError) {
      console.error('Error storing connection:', upsertError);
      console.error('Failed upsert details:', {
        user_id: userId,
        provider,
        account_id: accountInfo.id,
        account_name: accountInfo.name,
        error_code: upsertError.code,
        error_message: upsertError.message,
        error_details: upsertError.details
      });
      throw new Error('Failed to store social connection');
    }

    // Log security event
    await supabase
      .from('security_audit_log')
      .insert({
        user_id: userId,
        event_type: 'oauth_connected',
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
        details: {
          provider,
          account_id: accountInfo.id,
          account_name: accountInfo.name
        }
      });

    const appUrl = Deno.env.get('APP_URL') || 'https://captiongenie.app';
    return Response.redirect(`${appUrl}/performance?connected=${provider}`, 302);

  } catch (error) {
    console.error('OAuth callback error:', error);
    const appUrl = Deno.env.get('APP_URL') || 'https://captiongenie.app';
    return Response.redirect(
      `${appUrl}/performance?error=${encodeURIComponent('OAuth connection failed')}`,
      302
    );
  }
});

async function exchangeMetaToken(code: string) {
  const clientId = Deno.env.get('META_APP_ID');
  const clientSecret = Deno.env.get('META_APP_SECRET');
  const redirectUri = Deno.env.get('META_REDIRECT_URI');

  console.log('Exchanging Meta token with:', {
    clientId: clientId?.substring(0, 4) + '***',
    redirectUri,
    codeLength: code?.length,
    provider: 'Meta (Instagram/Facebook)'
  });

  const response = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?` +
    `client_id=${clientId}&` +
    `client_secret=${clientSecret}&` +
    `code=${code}&` +
    `redirect_uri=${redirectUri}`
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Facebook token exchange failed:', {
      status: response.status,
      statusText: response.statusText,
      body: errorBody
    });
    throw new Error(`Failed to exchange Meta token: ${errorBody}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: null,
    expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null
  };
}

async function getMetaAccountInfo(accessToken: string, provider: string) {
  if (provider === 'instagram') {
    // Step 1: Get Instagram User ID
    const userResponse = await fetch(
      'https://graph.instagram.com/me?fields=id,username',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!userResponse.ok) {
      throw new Error('Failed to fetch Instagram user info');
    }

    const userData = await userResponse.json();
    
    // Step 2: Try to get Business Account ID (if connected to Facebook Page)
    try {
      const accountResponse = await fetch(
        `https://graph.facebook.com/v18.0/${userData.id}/accounts?fields=instagram_business_account`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      
      if (accountResponse.ok) {
        const accountData = await accountResponse.json();
        const businessAccountId = accountData.data?.[0]?.instagram_business_account?.id;
        
        if (businessAccountId) {
          return {
            id: businessAccountId,
            name: userData.username,
            account_type: 'business'
          };
        }
      }
    } catch (e) {
      console.log('No business account found, using personal account');
    }
    
    // Fallback to personal account
    return {
      id: userData.id,
      name: userData.username,
      account_type: 'personal'
    };
  }
  
  // Facebook handling: Get user's Pages and Page Access Token
  // Step 1: Get user's Facebook Pages
  const pagesResponse = await fetch(
    'https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );

  if (!pagesResponse.ok) {
    const errorText = await pagesResponse.text();
    console.error('Failed to fetch Facebook pages:', errorText);
    throw new Error('Failed to fetch Facebook pages');
  }

  const pagesData = await pagesResponse.json();
  
  if (!pagesData.data || pagesData.data.length === 0) {
    throw new Error('No Facebook pages found. Please connect a Facebook page to use this feature.');
  }

  // Use first page (in the future, we could implement user selection)
  const page = pagesData.data[0];
  
  console.log('Facebook Page found:', {
    id: page.id,
    name: page.name,
    hasToken: !!page.access_token
  });
  
  return {
    id: page.id,
    name: page.name,
    access_token: page.access_token, // Page Access Token!
    account_type: 'page'
  };
}

async function exchangeTikTokToken(code: string) {
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI');

  const response = await fetch('https://open-api.tiktok.com/oauth/access_token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey!,
      client_secret: clientSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri!
    })
  });

  if (!response.ok) {
    throw new Error('Failed to exchange TikTok token');
  }

  const data = await response.json();
  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_at: new Date(Date.now() + data.data.expires_in * 1000).toISOString()
  };
}

async function getTikTokAccountInfo(accessToken: string) {
  const response = await fetch('https://open-api.tiktok.com/user/info/', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch TikTok account info');
  }

  const data = await response.json();
  return {
    id: data.data.user.open_id,
    name: data.data.user.display_name
  };
}

async function exchangeLinkedInToken(code: string) {
  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID');
  const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET');
  const redirectUri = Deno.env.get('LINKEDIN_REDIRECT_URI');

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri!
    })
  });

  if (!response.ok) {
    throw new Error('Failed to exchange LinkedIn token');
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
  };
}

async function getLinkedInAccountInfo(accessToken: string) {
  const response = await fetch('https://api.linkedin.com/v2/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch LinkedIn account info');
  }

  const data = await response.json();
  return {
    id: data.id,
    name: `${data.localizedFirstName} ${data.localizedLastName}`
  };
}

async function exchangeXToken(code: string) {
  const clientId = Deno.env.get('X_CLIENT_ID');
  const clientSecret = Deno.env.get('X_CLIENT_SECRET');
  const redirectUri = Deno.env.get('X_REDIRECT_URI');

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri!,
      code_verifier: 'challenge'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to exchange X token');
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
  };
}

async function getXAccountInfo(accessToken: string) {
  const response = await fetch('https://api.twitter.com/2/users/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch X account info');
  }

  const data = await response.json();
  return {
    id: data.data.id,
    name: data.data.username
  };
}

async function exchangeYouTubeToken(code: string) {
  // YouTube uses Google OAuth, so we use GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback?provider=youtube`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('YouTube token exchange failed:', errorText);
    throw new Error('Failed to exchange YouTube token');
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString()
  };
}

async function getYouTubeAccountInfo(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch YouTube account info');
  }

  const data = await response.json();
  return {
    id: data.items[0].id,
    name: data.items[0].snippet.title
  };
}
