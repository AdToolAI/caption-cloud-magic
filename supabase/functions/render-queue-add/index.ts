import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { 
      projectId, 
      templateId, 
      config, 
      priority = 5, 
      engine = 'auto',
      estimatedDurationSec 
    } = await req.json();

    if (!projectId) {
      throw new Error('Project ID is required');
    }

    // Estimate cost based on config
    let estimatedCost = 5; // Default
    if (engine === 'remotion') {
      estimatedCost = 5;
    } else if (engine === 'shotstack') {
      estimatedCost = 10;
    } else {
      // Auto: estimate based on duration
      estimatedCost = estimatedDurationSec && estimatedDurationSec > 60 ? 10 : 5;
    }

    // Insert into queue
    const { data: queueJob, error: insertError } = await supabase
      .from('render_queue')
      .insert({
        user_id: user.id,
        project_id: projectId,
        template_id: templateId,
        config: config || {},
        priority,
        engine,
        estimated_cost: estimatedCost,
        estimated_duration_sec: estimatedDurationSec,
        status: 'queued',
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to add to queue: ${insertError.message}`);
    }

    console.log(`✅ Job added to queue: ${queueJob.id} for user ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: queueJob.id,
        estimatedCost,
        position: 'calculating...'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error adding to queue:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
