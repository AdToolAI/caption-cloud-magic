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

    const { creation_id } = await req.json();

    if (!creation_id) {
      throw new Error('Missing required field: creation_id');
    }

    // Fetch video creation
    const { data: creation, error: creationError } = await supabase
      .from('video_creations')
      .select('*')
      .eq('id', creation_id)
      .eq('user_id', user.id)
      .single();

    if (creationError || !creation) {
      throw new Error('Video creation not found');
    }

    // If already completed or failed, return cached result
    if (creation.status === 'completed' || creation.status === 'failed') {
      return new Response(
        JSON.stringify({
          ok: true,
          status: creation.status,
          output_url: creation.output_url,
          error_message: creation.error_message
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!creation.render_id) {
      throw new Error('No render ID found');
    }

    // Check Shotstack status
    const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
    if (!shotstackApiKey) {
      throw new Error('SHOTSTACK_API_KEY not configured');
    }

    const shotstackResponse = await fetch(
      `https://api.shotstack.io/v1/render/${creation.render_id}`,
      {
        headers: {
          'x-api-key': shotstackApiKey
        }
      }
    );

    if (!shotstackResponse.ok) {
      const errorText = await shotstackResponse.text();
      console.error('Shotstack status check error:', errorText);
      throw new Error('Fehler beim Abrufen des Video-Status');
    }

    const shotstackData = await shotstackResponse.json();
    console.log('Shotstack status:', shotstackData);

    // Update database based on status
    if (shotstackData.response.status === 'done' && shotstackData.response.url) {
      await supabase
        .from('video_creations')
        .update({
          status: 'completed',
          output_url: shotstackData.response.url
        })
        .eq('id', creation.id);

      return new Response(
        JSON.stringify({
          ok: true,
          status: 'completed',
          output_url: shotstackData.response.url
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (shotstackData.response.status === 'failed') {
      await supabase
        .from('video_creations')
        .update({
          status: 'failed',
          error_message: shotstackData.response.error || 'Video-Rendering fehlgeschlagen'
        })
        .eq('id', creation.id);

      return new Response(
        JSON.stringify({
          ok: true,
          status: 'failed',
          error_message: shotstackData.response.error
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Still rendering
    return new Response(
      JSON.stringify({
        ok: true,
        status: 'rendering',
        shotstack_status: shotstackData.response.status
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Check video status error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
