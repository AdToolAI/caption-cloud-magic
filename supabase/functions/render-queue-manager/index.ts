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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🎬 Queue Manager: Processing queue...');

    // Get next job to process (highest priority, oldest first)
    const { data: nextJob, error: fetchError } = await supabase
      .from('render_queue')
      .select('*')
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to fetch queue: ${fetchError.message}`);
    }

    if (!nextJob) {
      console.log('✅ Queue is empty');
      return new Response(
        JSON.stringify({ message: 'Queue is empty', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎯 Processing job ${nextJob.id} for user ${nextJob.user_id}`);

    console.log(`🚀 Triggering render for job ${nextJob.id}...`);

    // Trigger actual render process
    const { error: renderError } = await supabase.functions.invoke(
      'process-video-render',
      {
        body: { job: nextJob }
      }
    );

    if (renderError) {
      console.error(`❌ Failed to trigger render: ${renderError.message}`);
      
      // Mark as failed
      await supabase
        .from('render_queue')
        .update({
          status: 'failed',
          error_message: renderError.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', nextJob.id);

      return new Response(
        JSON.stringify({ 
          success: false,
          error: renderError.message 
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Update queue stats
    const today = new Date().toISOString().split('T')[0];
    const { data: stats } = await supabase
      .from('render_queue_stats')
      .select('*')
      .eq('date', today)
      .eq('engine', nextJob.engine)
      .maybeSingle();

    if (stats) {
      await supabase
        .from('render_queue_stats')
        .update({
          total_jobs: (stats.total_jobs || 0) + 1,
          peak_queue_size: Math.max((stats.peak_queue_size || 0), 1)
        })
        .eq('id', stats.id);
    } else {
      await supabase
        .from('render_queue_stats')
        .insert({
          date: today,
          engine: nextJob.engine,
          total_jobs: 1,
          peak_queue_size: 1
        });
    }

    console.log(`✅ Job ${nextJob.id} marked as processing`);

    return new Response(
      JSON.stringify({ 
        success: true,
        jobId: nextJob.id,
        status: 'processing',
        message: 'Job is being processed'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in queue manager:', error);
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
