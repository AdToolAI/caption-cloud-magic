import { createClient } from 'npm:@supabase/supabase-js@2';

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
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { provider } = await req.json();

    if (!provider) {
      throw new Error('Provider parameter is required');
    }

    // Get connection
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('token_expires_at')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'NOT_CONNECTED', message: `${provider} not connected` }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      );
    }

    const expiresAt = new Date(connection.token_expires_at);
    const now = new Date();
    const msUntilExpiry = expiresAt.getTime() - now.getTime();
    const daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
    const needsReauth = daysUntilExpiry < 7;

    return new Response(
      JSON.stringify({
        ok: true,
        expires_at: connection.token_expires_at,
        days_until_expiry: daysUntilExpiry,
        needs_reauth: needsReauth,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Token status error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'TOKEN_STATUS_FAILED',
          message: error.message,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
