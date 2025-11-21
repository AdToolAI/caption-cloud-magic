import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { video_creation_id, formats } = await req.json();

    if (!video_creation_id || !formats || formats.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch video creation
    const { data: video, error: videoError } = await supabaseClient
      .from('video_creations')
      .select('*')
      .eq('id', video_creation_id)
      .eq('user_id', user.id)
      .single();

    if (videoError || !video) {
      return new Response(JSON.stringify({ error: 'Video not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Variants] Generating ${formats.length} variants for video ${video_creation_id}`);

    const variants_created = [];
    const errors = [];

    for (const variantConfig of formats) {
      try {
        const { format, aspect_ratio, quality } = variantConfig;

        // Create render job
        const { data: queueJob, error: queueError } = await supabaseClient
          .from('render_queue')
          .insert({
            user_id: user.id,
            project_id: video_creation_id,
            template_id: video.template_id,
            config: {
              ...video.customizations,
              format,
              aspect_ratio,
              quality: quality || '1080p'
            },
            priority: 'normal',
            status: 'queued'
          })
          .select()
          .single();

        if (queueError) throw queueError;

        // Invoke renderer
        const { data: renderResult, error: renderError } = await supabaseClient.functions.invoke(
          'process-video-render',
          {
            body: {
              id: queueJob.id,
              project_id: video_creation_id,
              template_id: video.template_id,
              config: queueJob.config,
              engine: 'auto'
            }
          }
        );

        if (renderError) throw renderError;

        // Create variant record
        const { data: variant } = await supabaseClient
          .from('video_variants')
          .insert({
            video_creation_id,
            variant_type: 'format',
            format,
            aspect_ratio,
            file_url: renderResult.output_url,
            file_size_mb: renderResult.file_size_mb || 0,
            duration_sec: renderResult.duration_sec || video.duration_sec
          })
          .select()
          .single();

        variants_created.push({
          format,
          aspect_ratio,
          quality,
          url: renderResult.output_url,
          variant_id: variant?.id
        });

      } catch (error) {
        console.error(`[Variants] Error creating variant:`, error);
        errors.push({
          format: variantConfig.format,
          aspect_ratio: variantConfig.aspect_ratio,
          error: error instanceof Error ? error.message : 'Failed'
        });
      }
    }

    console.log(`[Variants] Created ${variants_created.length}/${formats.length} variants`);

    return new Response(JSON.stringify({
      ok: true,
      variants_created,
      errors,
      success_rate: `${variants_created.length}/${formats.length}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Variants] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
