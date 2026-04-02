import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, code: 'auth', step: 'auth', error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, code: 'auth', step: 'auth', error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { video_url, project_id } = await req.json();
    if (!video_url || !project_id) {
      return new Response(JSON.stringify({ ok: false, code: 'validation', step: 'input', error: 'video_url and project_id are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[RemoveBurnedSubs] Starting async for user:', user.id, 'project:', project_id);

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      return new Response(JSON.stringify({ ok: false, code: 'config', step: 'replicate', error: 'REPLICATE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

    // Update project status to processing
    await supabase
      .from('director_cut_projects')
      .update({
        burned_subtitles_status: 'processing',
        burned_subtitles_error: null,
        cleaned_video_url: null,
      })
      .eq('id', project_id)
      .eq('user_id', user.id);

    // Create async prediction with webhook
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    const webhookUrl = `${SUPABASE_URL}/functions/v1/director-cut-burned-subtitles-webhook`;
    console.log('[RemoveBurnedSubs] Creating prediction with webhook:', webhookUrl);

    const prediction = await replicate.predictions.create({
      version: "247c8385f3c6c322110a6787bd2d257acc3a3d60b9ed7da1726a628f72a42c4d",
      input: {
        video: video_url,
        method: "hybrid",
        conf_threshold: 0.25,
        margin: 5,
      },
      webhook: webhookUrl,
      webhook_events_filter: ["completed"],
    });

    console.log('[RemoveBurnedSubs] Prediction created:', prediction.id);

    // Save prediction ID to project
    await supabase
      .from('director_cut_projects')
      .update({
        burned_subtitles_prediction_id: prediction.id,
      })
      .eq('id', project_id)
      .eq('user_id', user.id);

    return new Response(JSON.stringify({
      ok: true,
      status: 'processing',
      prediction_id: prediction.id,
      message: 'Verarbeitung gestartet. Dies kann 1–3 Minuten dauern.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[RemoveBurnedSubs] Error:', error);
    return new Response(JSON.stringify({
      ok: false,
      code: 'internal',
      step: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
