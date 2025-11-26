import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { getRenderProgress } from "npm:@remotion/lambda-client@4.0.377";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Check Remotion progress request received');
    
    const { render_id } = await req.json();
    
    if (!render_id) {
      throw new Error('render_id is required');
    }

    console.log('📊 Checking progress for render:', render_id);

    // Initialize Supabase admin client for database queries
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch bucket_name from database
    const { data: renderData, error: renderError } = await supabaseAdmin
      .from('video_renders')
      .select('bucket_name')
      .eq('render_id', render_id)
      .single();

    if (renderError || !renderData?.bucket_name) {
      throw new Error('Render not found in database or missing bucket_name');
    }

    const bucketName = renderData.bucket_name;
    console.log('🪣 Using bucket_name:', bucketName);

    // Use official Remotion Lambda Client to get progress
    console.log('🚀 Getting render progress with official client...');
    
    const progress = await getRenderProgress({
      renderId: render_id,
      bucketName: bucketName,
      region: 'eu-central-1',
      functionName: 'remotion-render-4-0-377-mem2048mb-disk2048mb-120sec'
    });

    console.log('📥 Progress response:', JSON.stringify(progress, null, 2));

    // Update database if render is complete or failed
    if (progress.done || progress.fatalErrorEncountered) {
      console.log('✅ Render status changed, updating database...');

      if (progress.done && progress.outputFile) {
        // Render completed successfully
        await supabaseAdmin
          .from('video_renders')
          .update({
            status: 'completed',
            video_url: progress.outputFile,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('render_id', render_id);

        console.log('✅ Marked render as completed in database');
      } else if (progress.fatalErrorEncountered) {
        // Render failed
        const errorMessage = progress.errors?.join(', ') || 'Unknown error';
        
        await supabaseAdmin
          .from('video_renders')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('render_id', render_id);

        console.log('❌ Marked render as failed in database');
      }
    }

    // Return progress data to frontend
    return new Response(
      JSON.stringify({
        success: true,
        render_id,
        progress: {
          done: progress.done || false,
          fatalErrorEncountered: progress.fatalErrorEncountered || false,
          outputFile: progress.outputFile,
          errors: progress.errors,
          overallProgress: progress.overallProgress || 0,
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Error checking Remotion progress:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
