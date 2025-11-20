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

    const { project_id, component_name, customizations, format = 'mp4', aspect_ratio = '9:16' } = await req.json();

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

    // Fetch Remotion template
    const { data: template, error: templateError } = await supabaseClient
      .from('remotion_templates')
      .select('*')
      .eq('component_name', component_name)
      .eq('is_active', true)
      .single();

    if (templateError || !template) {
      return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate credits (Remotion is 5 credits per video)
    const credits_required = 5;

    // Check credits
    const { data: wallet } = await supabaseClient
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!wallet || wallet.balance < credits_required) {
      return new Response(JSON.stringify({ 
        error: 'Insufficient credits',
        required: credits_required,
        available: wallet?.balance || 0
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Deduct credits
    await supabaseClient.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount: credits_required
    });

    // Update project status
    await supabaseClient
      .from('content_projects')
      .update({
        status: 'rendering',
        render_engine: 'remotion'
      })
      .eq('id', project_id);

    console.log('Starting Remotion render:', {
      component_name,
      customizations,
      template_config: template
    });

    // In production, this would trigger AWS Lambda with @remotion/lambda
    // For now, simulate render with mock response
    const render_id = `remotion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate rendering delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock output URL (in production would be from S3/Cloudflare)
    const output_url = `https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4?render=${render_id}`;

    // Update project with completed render
    await supabaseClient
      .from('content_projects')
      .update({
        status: 'completed',
        render_id,
        output_video_url: output_url,
        output_urls: {
          [aspect_ratio]: output_url
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', project_id);

    console.log('Remotion render completed:', {
      render_id,
      output_url,
      credits_used: credits_required
    });

    return new Response(JSON.stringify({
      ok: true,
      render_id,
      output_url,
      status: 'completed',
      credits_used: credits_required,
      engine: 'remotion'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Remotion render error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
