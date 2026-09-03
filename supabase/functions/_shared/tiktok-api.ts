import {
  parseTikTokTokenResponse,
  type TikTokTokenErrorCode,
} from './tiktok-token-response.ts';

const TIKTOK_ENV = Deno.env.get('TIKTOK_ENV') || 'production';
const OAUTH_BASE = 'https://open.tiktokapis.com/v2/oauth';
const API_BASE = 'https://open.tiktokapis.com/v2';

/** Structured token error so callers can log a reason code, never a value. */
export class TikTokTokenError extends Error {
  constructor(public readonly code: TikTokTokenErrorCode | 'HTTP_ERROR', message: string) {
    super(message);
    this.name = 'TikTokTokenError';
  }
}


/**
 * Single source of truth for TikTok credentials.
 * Production values (TIKTOK_*_PROD) always win over the legacy sandbox values,
 * because the legacy TIKTOK_CLIENT_KEY secret is integration-managed and still
 * holds the sandbox key (`sb...`), which makes TikTok answer `non_sandbox_target`.
 */
export function getTikTokClientKey(): string {
  return (
    Deno.env.get('TIKTOK_CLIENT_KEY_PROD') ||
    Deno.env.get('TIKTOK_CLIENT_KEY') ||
    ''
  );
}

export function getTikTokClientSecret(): string {
  return (
    Deno.env.get('TIKTOK_CLIENT_SECRET_PROD') ||
    Deno.env.get('TIKTOK_CLIENT_SECRET') ||
    ''
  );
}

export function getTikTokRedirectUri(): string {
  return (
    Deno.env.get('TIKTOK_REDIRECT_URI_PROD') ||
    Deno.env.get('TIKTOK_REDIRECT_URI') ||
    ''
  );
}

export function isSandboxClientKey(key = getTikTokClientKey()): boolean {
  return key.toLowerCase().startsWith('sb');
}


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
  const clientKey = getTikTokClientKey();
  const clientSecret = getTikTokClientSecret();
  const redirectUri = getTikTokRedirectUri();

  console.log('Exchanging code for tokens (client_key hidden for security)');
  console.log('Redirect URI:', redirectUri, 'Environment:', TIKTOK_ENV);

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

  const parsed = parseTikTokTokenResponse(data);
  if (!parsed.ok) {
    console.error('TikTok token exchange rejected:', { code: parsed.code, message: parsed.message });
    throw new TikTokTokenError(parsed.code, parsed.message);
  }

  return parsed.tokens;
}

// Refresh Access Token
export async function refreshAccessToken(refreshToken: string): Promise<TikTokTokenResponse> {
  const clientKey = getTikTokClientKey();
  const clientSecret = getTikTokClientSecret();

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
    throw new TikTokTokenError('HTTP_ERROR', `Token refresh failed: ${response.status}`);
  }

  const data = await response.json();

  // TikTok OAuth v2 returns the token fields FLAT; older/nested shapes are
  // still accepted for backward compatibility.
  const parsed = parseTikTokTokenResponse(data);
  if (!parsed.ok) {
    console.error('TikTok token refresh rejected:', { code: parsed.code, message: parsed.message });
    throw new TikTokTokenError(parsed.code, parsed.message);
  }

  return parsed.tokens;
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
  // Request basic profile fields; counts may be unavailable for new accounts and default to 0 below
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
  
  if (data.error?.code !== 'ok' || !data.data?.user) {
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
  const clientKey = getTikTokClientKey();
  const redirectUri = getTikTokRedirectUri();
  
  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.set('client_key', clientKey);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'user.info.basic,video.upload,video.publish'); // Add video upload permissions
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  
  console.log('Built TikTok auth URL:', { clientKeyType: isSandboxClientKey(clientKey) ? 'sandbox' : 'production', redirectUri, env: TIKTOK_ENV });
  
  return authUrl.toString();
}
