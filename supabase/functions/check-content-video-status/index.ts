import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { project_id } = await req.json();

    if (!project_id) {
      throw new Error('Missing required field: project_id');
    }

    console.log('[check-content-video-status] Checking project:', project_id);

    // Fetch project from content_projects
    const { data: project, error: projectError } = await supabase
      .from('content_projects')
      .select('*')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      console.error('[check-content-video-status] Project not found:', projectError);
      throw new Error('Projekt nicht gefunden');
    }

    // If already completed or failed, return cached result
    if (project.status === 'completed' || project.status === 'failed') {
      console.log('[check-content-video-status] Returning cached status:', project.status);
      return new Response(
        JSON.stringify({
          ok: true,
          status: project.status,
          output_urls: project.output_urls || {},
          progress: 100
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!project.render_id) {
      throw new Error('Keine Render-ID gefunden');
    }

    // Check Shotstack status
    const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
    if (!shotstackApiKey) {
      throw new Error('SHOTSTACK_API_KEY nicht konfiguriert');
    }

    console.log('[check-content-video-status] Checking Shotstack render:', project.render_id);
    const shotstackResponse = await fetch(
      `https://api.shotstack.io/v1/render/${project.render_id}`,
      {
        headers: {
          'x-api-key': shotstackApiKey
        }
      }
    );

    if (!shotstackResponse.ok) {
      const errorText = await shotstackResponse.text();
      console.error('[check-content-video-status] Shotstack error:', errorText);
      throw new Error('Fehler beim Abrufen des Video-Status');
    }

    const shotstackData = await shotstackResponse.json();
    const shotstackStatus = shotstackData.response?.status;
    const shotstackUrl = shotstackData.response?.url;

    console.log('[check-content-video-status] Shotstack status:', {
      status: shotstackStatus,
      hasUrl: !!shotstackUrl,
    });

    // Update database based on status
    if (shotstackStatus === 'done' && shotstackUrl) {
      const outputUrls = { mp4: shotstackUrl };
      
      await supabase
        .from('content_projects')
        .update({
          status: 'completed',
          output_urls: outputUrls,
          completed_at: new Date().toISOString()
        })
        .eq('id', project.id);

      console.log('[check-content-video-status] Video completed:', shotstackUrl);

      return new Response(
        JSON.stringify({
          ok: true,
          status: 'completed',
          output_urls: outputUrls,
          progress: 100
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (shotstackStatus === 'failed') {
      const errorMessage = shotstackData.response?.error || 'Video-Rendering fehlgeschlagen';
      
      await supabase
        .from('content_projects')
        .update({
          status: 'failed'
        })
        .eq('id', project.id);

      console.error('[check-content-video-status] Video failed:', errorMessage);

      return new Response(
        JSON.stringify({
          ok: true,
          status: 'failed',
          error_message: errorMessage,
          progress: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Still rendering - calculate approximate progress
    let progress = 50;
    if (shotstackStatus === 'queued') progress = 10;
    if (shotstackStatus === 'fetching') progress = 30;
    if (shotstackStatus === 'rendering') progress = 70;

    console.log('[check-content-video-status] Still rendering:', {
      status: shotstackStatus,
      progress,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        status: 'rendering',
        shotstack_status: shotstackStatus,
        progress
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-content-video-status] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
