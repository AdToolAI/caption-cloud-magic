import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptToken, decryptToken } from './crypto.ts';

interface RefreshResult {
  accessToken: string | null;
  error: string | null;
}

/**
 * Refreshes YouTube OAuth token using refresh_token
 * Updates the social_connections table with new access token and expiry
 */
export async function refreshYouTubeToken(
  connection: any,
  supabase: SupabaseClient
): Promise<RefreshResult> {
  try {
    // Check if refresh_token_hash exists
    if (!connection.refresh_token_hash) {
      console.error('[YouTube] No refresh token available');
      return {
        accessToken: null,
        error: 'No refresh token found. Please reconnect YouTube.'
      };
    }

    console.log('[YouTube] Attempting to decrypt refresh_token...');
    
    let refreshToken: string;
    try {
      refreshToken = await decryptToken(connection.refresh_token_hash);
      console.log('[YouTube] Refresh token decrypted successfully');
    } catch (decryptErr: any) {
      console.error('[YouTube] Refresh token decryption failed:', {
        error: decryptErr.message,
        hash_length: connection.refresh_token_hash?.length,
        hash_present: !!connection.refresh_token_hash
      });
      return {
        accessToken: null,
        error: `Token decryption failed: ${decryptErr.message}. Please reconnect YouTube.`
      };
    }

    // Call Google OAuth token endpoint
    const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!refreshResponse.ok) {
      const errorData = await refreshResponse.json();
      console.error('[YouTube] Token refresh failed:', errorData);
      return {
        accessToken: null,
        error: 'Token refresh failed - please reconnect YouTube'
      };
    }

    const refreshData = await refreshResponse.json();
    const newAccessToken = refreshData.access_token;

    // Update connection in DB
    const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000);
    const { error: updateError } = await supabase
      .from('social_connections')
      .update({
        access_token_hash: await encryptToken(newAccessToken),
        token_expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error('[YouTube] Failed to update token in DB:', updateError);
      return {
        accessToken: null,
        error: 'Failed to save refreshed token'
      };
    }

    console.log('[YouTube] ✅ Token refreshed and saved successfully');
    return {
      accessToken: newAccessToken,
      error: null
    };

  } catch (error: any) {
    console.error('[YouTube] Unexpected error during token refresh:', error);
    return {
      accessToken: null,
      error: error.message || 'Unknown error during token refresh'
    };
  }
}
