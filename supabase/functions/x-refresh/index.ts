import { createClient } from 'npm:@supabase/supabase-js@2';
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Auto-find X connection for this user
    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'x')
      .eq('is_active', true)
      .maybeSingle();

    if (connectionError || !connection) {
      return new Response(
        JSON.stringify({ ok: false, error: 'X not connected' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connection.refresh_token_hash) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No refresh token available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const refreshToken = await decryptToken(connection.refresh_token_hash);

    const xClientId = Deno.env.get('X_CLIENT_ID');
    const xClientSecret = Deno.env.get('X_CLIENT_SECRET');

    if (!xClientId || !xClientSecret) {
      throw new Error('X credentials not configured');
    }

    // Refresh token
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${xClientId}:${xClientSecret}`)}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[x-refresh] Token refresh error:', tokenData);
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
      .eq('id', connection.id);

    if (updateError) {
      throw updateError;
    }

    console.log('[x-refresh] Token refreshed successfully', { expires_at: expiresAt.toISOString() });

    return new Response(
      JSON.stringify({ ok: true, expires_at: expiresAt.toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[x-refresh] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
