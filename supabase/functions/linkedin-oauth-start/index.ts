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
    // Get JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get LinkedIn OAuth credentials
    const clientId = Deno.env.get('LINKEDIN_CLIENT_ID');
    const redirectUri = Deno.env.get('LINKEDIN_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new Error('LinkedIn OAuth credentials not configured');
    }

    // Generate CSRF state token
    const stateData = {
      user_id: user.id,
      csrf_token: crypto.randomUUID(),
      timestamp: Date.now(),
      provider: 'linkedin'
    };
    const state = btoa(JSON.stringify(stateData));

    // Store state in oauth_states table with 5 minute TTL
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await supabase
      .from('oauth_states')
      .insert({
        state,
        user_id: user.id,
        provider: 'linkedin',
        expires_at: expiresAt.toISOString(),
      });

    // Build LinkedIn authorization URL (Legacy OAuth 2.0)
    const scope = 'r_liteprofile r_emailaddress w_member_social';
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
      `response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    console.log(`✅ Generated LinkedIn auth URL for user ${user.id}`);

    return new Response(
      JSON.stringify({ authUrl }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ LinkedIn auth start error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: { 
          code: 'LINKEDIN_AUTH_START_FAILED',
          message: errorMessage 
        } 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
