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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const { connectionId } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Get connection
    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .eq('provider', 'x')
      .single();

    if (connectionError || !connection) {
      throw new Error('Connection not found');
    }

    if (!connection.refresh_token_hash) {
      throw new Error('No refresh token available');
    }

    const refreshToken = await decryptToken(connection.refresh_token_hash);

    // Refresh token
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${Deno.env.get('X_CLIENT_ID')}:${Deno.env.get('X_CLIENT_SECRET')}`)}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token refresh error:', tokenData);
      throw new Error(tokenData.error_description || 'Token refresh failed');
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Update connection
    const { error: updateError } = await supabase
      .from('social_connections')
      .update({
        access_token_hash: await encryptToken(tokenData.access_token),
        refresh_token_hash: tokenData.refresh_token ? await encryptToken(tokenData.refresh_token) : connection.refresh_token_hash,
        token_expires_at: expiresAt.toISOString(),
      })
      .eq('id', connectionId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, expiresAt: expiresAt.toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('X token refresh error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
