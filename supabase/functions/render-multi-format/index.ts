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

    const { project_id, export_settings } = await req.json();

    // Fetch project
    const { data: project, error: projectError } = await supabaseClient
      .from('content_projects')
      .select('*')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { formats, aspect_ratios, quality, include_watermark, include_subtitles } = export_settings;
    
    // Calculate total variants and credits
    const total_variants = formats.length * aspect_ratios.length;
    const credits_per_variant = 5;
    const total_credits = total_variants * credits_per_variant;

    // Check credits
    const { data: wallet } = await supabaseClient
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!wallet || wallet.balance < total_credits) {
      return new Response(JSON.stringify({ 
        error: 'Insufficient credits',
        required: total_credits,
        available: wallet?.balance || 0
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Deduct credits
    await supabaseClient.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount: total_credits
    });

    // Create batch render record
    const { data: batchRender, error: batchError } = await supabaseClient
      .from('batch_renders')
      .insert({
        project_id,
        user_id: user.id,
        export_settings,
        total_variants,
        credits_used: total_credits,
        status: 'rendering'
      })
      .select()
      .single();

    if (batchError) {
      console.error('Batch render creation error:', batchError);
      return new Response(JSON.stringify({ error: 'Failed to create batch render' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Multi-Format] Starting ${total_variants} renders for project ${project_id}`);

    // Start rendering variants in parallel (real rendering!)
    const render_promises = [];
    
    for (const format of formats) {
      for (const aspect_ratio of aspect_ratios) {
        // Create render job for each variant
        const renderPromise = (async () => {
          try {
            // Add to render queue
            const { data: queueJob, error: queueError } = await supabaseClient
              .from('render_queue')
              .insert({
                user_id: user.id,
                project_id,
                template_id: project.template_id,
                config: {
                  ...project.config,
                  format,
                  aspect_ratio,
                  quality,
                  include_watermark,
                  include_subtitles
                },
                priority: 'normal',
                status: 'queued'
              })
              .select()
              .single();

            if (queueError) throw queueError;

            // Invoke render processor
            const { data: renderResult, error: renderError } = await supabaseClient.functions.invoke(
              'process-video-render',
              {
                body: {
                  id: queueJob.id,
                  project_id,
                  template_id: project.template_id,
                  config: queueJob.config,
                  engine: 'auto'
                }
              }
            );

            if (renderError) throw renderError;

            // Create video variant record
            const { data: variant } = await supabaseClient
              .from('video_variants')
              .insert({
                video_creation_id: project_id,
                variant_type: 'format',
                format,
                aspect_ratio,
                file_url: renderResult.output_url,
                file_size_mb: renderResult.file_size_mb || 0,
                duration_sec: renderResult.duration_sec || project.duration_sec
              })
              .select()
              .single();

            return {
              format,
              aspect_ratio,
              url: renderResult.output_url,
              size_mb: renderResult.file_size_mb || 0,
              variant_id: variant?.id
            };
          } catch (error) {
            console.error(`[Multi-Format] Error rendering ${format} ${aspect_ratio}:`, error);
            return {
              format,
              aspect_ratio,
              error: error instanceof Error ? error.message : 'Render failed',
              url: null
            };
          }
        })();

        render_promises.push(renderPromise);
      }
    }

    // Wait for all renders to complete
    const render_results = await Promise.all(render_promises);
    const successful_renders = render_results.filter(r => !r.error);
    const failed_renders = render_results.filter(r => r.error);

    // Update batch render with results
    await supabaseClient
      .from('batch_renders')
      .update({
        status: failed_renders.length > 0 ? 'partial' : 'completed',
        completed_variants: successful_renders.length,
        failed_variants: failed_renders.length,
        render_results,
        completed_at: new Date().toISOString()
      })
      .eq('id', batchRender.id);

    // Update project output_urls
    const output_urls: Record<string, string> = {};
    successful_renders.forEach(result => {
      if (result.url) {
        output_urls[`${result.aspect_ratio}_${result.format}`] = result.url;
      }
    });

    await supabaseClient
      .from('content_projects')
      .update({ output_urls })
      .eq('id', project_id);

    console.log(`[Multi-Format] Completed: ${successful_renders.length}/${total_variants} successful`);

    return new Response(JSON.stringify({
      ok: true,
      batch_id: batchRender.id,
      rendered_videos: successful_renders,
      failed_videos: failed_renders,
      credits_used: total_credits,
      success_rate: `${successful_renders.length}/${total_variants}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Multi-format render error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
