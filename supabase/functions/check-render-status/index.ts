import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse body safely
    let renderId: string | undefined;
    try {
      const body = await req.json();
      renderId = body?.renderId;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (!renderId) {
      return jsonResponse({ error: 'Render ID is required' }, 400);
    }

    // Auth header check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Get render job status (RLS ensures user can only access their own renders)
    const { data, error } = await supabase
      .from('video_renders')
      .select('*')
      .eq('render_id', renderId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('DB error fetching render status:', error);
      return jsonResponse({ error: `Failed to fetch render status: ${error.message}` }, 500);
    }

    if (!data) {
      return jsonResponse({ error: 'Render job not found or access denied' }, 404);
    }

    return jsonResponse({
      status: data.status,
      downloadUrl: data.video_url,
      error: data.error_message,
      startedAt: data.started_at,
      completedAt: data.completed_at,
    }, 200);

  } catch (error) {
    console.error('Unexpected error checking render status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return jsonResponse({ error: errorMessage }, 500);
  }
});
