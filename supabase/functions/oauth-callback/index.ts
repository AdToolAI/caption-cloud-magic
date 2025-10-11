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

    // Decode state to get user_id
    const stateData = JSON.parse(atob(state || ''));
    const userId = stateData.user_id;

    if (!userId) {
      throw new Error('Invalid state parameter');
    }

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

    // Store connection in database
    const expiresAt = tokenData.expires_in 
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const { error: dbError } = await supabase
      .from('social_connections')
      .upsert({
        user_id: userId,
        provider,
        account_id: accountInfo.id,
        account_name: accountInfo.name,
        access_token_hash: btoa(tokenData.access_token),
        refresh_token_hash: tokenData.refresh_token ? btoa(tokenData.refresh_token) : null,
        token_expires_at: expiresAt,
        last_sync_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider,account_id'
      });

    if (dbError) throw dbError;

    // Redirect back to app
    const redirectUrl = `${Deno.env.get('SUPABASE_URL')?.replace('https://', 'https://8e97f8e1-59d6-4796-9a44-4c05ca0bfc66.')}/performance?connected=${provider}`;
    
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': redirectUrl
      }
    });

  } catch (error: any) {
    console.error('OAuth callback error:', error);
    const redirectUrl = `${Deno.env.get('SUPABASE_URL')?.replace('https://', 'https://8e97f8e1-59d6-4796-9a44-4c05ca0bfc66.')}/performance?error=${encodeURIComponent(error.message)}`;
    
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': redirectUrl
      }
    });
  }
});

async function exchangeMetaToken(code: string) {
  const clientId = Deno.env.get('META_APP_ID');
  const clientSecret = Deno.env.get('META_APP_SECRET');
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback?provider=instagram`;

  const response = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Meta token exchange failed: ${error}`);
  }

  return await response.json();
}

async function getMetaAccountInfo(accessToken: string, provider: string) {
  const endpoint = provider === 'instagram'
    ? 'https://graph.instagram.com/me?fields=id,username'
    : 'https://graph.facebook.com/me?fields=id,name';

  const response = await fetch(endpoint, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) throw new Error('Failed to fetch Meta account info');
  
  const data = await response.json();
  return {
    id: data.id,
    name: data.username || data.name
  };
}

async function exchangeTikTokToken(code: string) {
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');

  const response = await fetch('https://open-api.tiktok.com/oauth/access_token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey!,
      client_secret: clientSecret!,
      code,
      grant_type: 'authorization_code'
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.data;
}

async function getTikTokAccountInfo(accessToken: string) {
  const response = await fetch('https://open-api.tiktok.com/oauth/userinfo/', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const data = await response.json();
  return {
    id: data.data.open_id,
    name: data.data.display_name
  };
}

async function exchangeLinkedInToken(code: string) {
  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID');
  const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET');
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback?provider=linkedin`;

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri
    })
  });

  return await response.json();
}

async function getLinkedInAccountInfo(accessToken: string) {
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const data = await response.json();
  return {
    id: data.sub,
    name: data.name
  };
}

async function exchangeXToken(code: string) {
  const clientId = Deno.env.get('X_CLIENT_ID');
  const clientSecret = Deno.env.get('X_CLIENT_SECRET');

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback?provider=x`,
      code_verifier: 'challenge'
    })
  });

  return await response.json();
}

async function getXAccountInfo(accessToken: string) {
  const response = await fetch('https://api.twitter.com/2/users/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const data = await response.json();
  return {
    id: data.data.id,
    name: data.data.username
  };
}

async function exchangeYouTubeToken(code: string) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback?provider=youtube`,
      grant_type: 'authorization_code'
    })
  });

  return await response.json();
}

async function getYouTubeAccountInfo(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const data = await response.json();
  return {
    id: data.items[0].id,
    name: data.items[0].snippet.title
  };
}