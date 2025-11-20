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

    // Start rendering variants (simplified - in production would call Shotstack API)
    const render_results = [];
    
    for (const format of formats) {
      for (const aspect_ratio of aspect_ratios) {
        // Simulate rendering
        const result = {
          format,
          aspect_ratio,
          url: `${project.output_video_url}?format=${format}&ratio=${aspect_ratio}`,
          size_mb: Math.random() * 5 + 1 // Mock size
        };
        render_results.push(result);
      }
    }

    // Update batch render with results
    await supabaseClient
      .from('batch_renders')
      .update({
        status: 'completed',
        completed_variants: total_variants,
        render_results,
        completed_at: new Date().toISOString()
      })
      .eq('id', batchRender.id);

    // Update project output_urls
    const output_urls: Record<string, string> = {};
    render_results.forEach(result => {
      output_urls[`${result.aspect_ratio}_${result.format}`] = result.url;
    });

    await supabaseClient
      .from('content_projects')
      .update({ output_urls })
      .eq('id', project_id);

    return new Response(JSON.stringify({
      ok: true,
      batch_id: batchRender.id,
      rendered_videos: render_results,
      credits_used: total_credits
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