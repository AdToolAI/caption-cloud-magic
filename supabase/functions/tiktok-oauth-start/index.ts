import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildAuthUrl } from '../_shared/tiktok-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Warmup ping early-return (no auth required)
  try {
    const body = await req.clone().json().catch(() => ({}));
    if (body?.warmup) {
      return new Response(JSON.stringify({ warmed: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } catch (_) { /* ignore */ }

  try {
    // Auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    // Parse returnTo from body
    let returnTo: string | null = null;
    try {
      const body = await req.json();
      returnTo = body?.returnTo || null;
    } catch (_) {
      // no body is fine
    }

    // Validate returnTo URL
    let safeReturnTo: string | null = null;
    if (returnTo) {
      try {
        const parsed = new URL(returnTo);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
          safeReturnTo = returnTo;
        }
      } catch (_) {
        // invalid URL - ignore
      }
    }

    // Generate CSRF state
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10min

    // Store state in DB
    const { error: stateError } = await supabase
      .from('oauth_states')
      .insert({
        csrf_token: state,
        user_id: user.id,
        provider: 'tiktok',
        expires_at: expiresAt.toISOString(),
        redirect_url: safeReturnTo,
      });

    if (stateError) {
      console.error('Failed to store OAuth state:', stateError);
      throw new Error('Failed to initialize OAuth');
    }

    // Build TikTok auth URL
    const authUrl = buildAuthUrl(state);

    const tiktokEnv = Deno.env.get('TIKTOK_ENV') || 'production';
    const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI');
    console.log(`Redirecting to TikTok OAuth (${tiktokEnv}):`, {
      userId: user.id,
      state,
      returnTo: safeReturnTo,
      env: tiktokEnv,
      redirect_uri: redirectUri
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        authUrl: authUrl 
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('OAuth start error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
