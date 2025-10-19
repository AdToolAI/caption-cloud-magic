const TIKTOK_ENV = Deno.env.get('TIKTOK_ENV') || 'sandbox';
const OAUTH_BASE = 'https://open.tiktokapis.com/v2/oauth';
const API_BASE = 'https://open.tiktokapis.com/v2';

export interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
  scope: string;
}

export interface TikTokUserInfo {
  open_id: string;
  display_name: string;
  avatar_url: string;
  username?: string;
  follower_count?: number;
  following_count?: number;
  video_count?: number;
}

// Token Exchange: Authorization Code → Tokens
export async function exchangeCodeForTokens(code: string): Promise<TikTokTokenResponse> {
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY')!;
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET')!;
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI')!;

  console.log('Exchanging code for tokens:', { clientKey, redirectUri, env: TIKTOK_ENV });

  const response = await fetch(`${OAUTH_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('TikTok token exchange failed:', { status: response.status, error: errorText });
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = await response.json();
  
  // TikTok returns tokens directly in the response body
  if (data.error) {
    console.error('TikTok API error:', data);
    throw new Error(data.error?.message || 'Token exchange failed');
  }
  
  // Return the data directly (not data.data)
  return data;
}

// Refresh Access Token
export async function refreshAccessToken(refreshToken: string): Promise<TikTokTokenResponse> {
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY')!;
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET')!;

  console.log('Refreshing TikTok access token');

  const response = await fetch(`${OAUTH_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token refresh failed:', { status: response.status, error: errorText });
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.error || !data.data) {
    throw new Error(data.error?.message || 'Token refresh failed');
  }
  
  return data.data;
}

// Check if token needs refresh (5min buffer)
export function needsRefresh(expiresAt: string): boolean {
  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  return (expiryTime - now) < fiveMinutes;
}

// Get User Info
export async function getUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  // Only request fields that are guaranteed to be available in sandbox mode
  const fields = [
    'open_id',
    'display_name',
    'avatar_url'
  ].join(',');

  const response = await fetch(`${API_BASE}/user/info/?fields=${fields}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('TikTok user info failed:', { status: response.status, error: errorText });
    throw new Error(`User info failed: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.error || !data.data?.user) {
    console.error('TikTok user info error:', data);
    throw new Error(data.error?.message || 'User info failed');
  }
  
  // Return with default values for optional fields
  return {
    ...data.data.user,
    follower_count: data.data.user.follower_count || 0,
    following_count: data.data.user.following_count || 0,
    video_count: data.data.user.video_count || 0
  };
}

// Build Authorization URL
export function buildAuthUrl(state: string): string {
  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY')!;
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI')!;
  
  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize');
  authUrl.searchParams.set('client_key', clientKey);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'user.info.basic'); // Only basic info for now!
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  
  console.log('Built TikTok auth URL:', { clientKey, redirectUri, env: TIKTOK_ENV });
  
  return authUrl.toString();
}
