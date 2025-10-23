import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProviderHealth {
  connected: boolean;
  expiring_in_days?: number;
}

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

    // Get all active connections for user
    const { data: connections, error: connError } = await supabase
      .from('social_connections')
      .select('provider, token_expires_at')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (connError) {
      console.error('[social-health] Error fetching connections:', connError);
      throw new Error('Failed to fetch connections');
    }

    // Build provider health map
    const providers: Record<string, ProviderHealth> = {
      x: { connected: false },
      instagram: { connected: false },
      linkedin: { connected: false },
      facebook: { connected: false },
      tiktok: { connected: false },
      youtube: { connected: false },
    };

    const now = new Date();

    connections?.forEach((conn) => {
      const health: ProviderHealth = { connected: true };

      if (conn.token_expires_at) {
        const expiresAt = new Date(conn.token_expires_at);
        const msUntilExpiry = expiresAt.getTime() - now.getTime();
        const daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry >= 0) {
          health.expiring_in_days = daysUntilExpiry;
        }
      }

      providers[conn.provider] = health;
    });

    console.log('[social-health] Health check completed', { providers });

    return new Response(
      JSON.stringify({ providers }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[social-health] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        ok: false,
        error: errorMessage,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
