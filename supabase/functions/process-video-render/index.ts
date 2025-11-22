import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenderJob {
  id: string;
  project_id: string;
  template_id?: string;
  config: any;
  engine: 'remotion' | 'shotstack' | 'auto';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { job }: { job: RenderJob } = await req.json();
    console.log(`🎬 Processing render job ${job.id} with engine: ${job.engine}`);

    // Update job status to processing with detailed stage
    await supabase
      .from('render_queue')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', job.id);

    // Update video creation with progress stage
    if (job.project_id) {
      await supabase
        .from('video_creations')
        .update({
          status: 'rendering',
          progress_stage: 'initializing',
          progress_percentage: 5
        })
        .eq('id', job.project_id);
    }

    // Determine rendering engine
    let engine = job.engine;
    if (engine === 'auto') {
      // Auto-select based on config complexity
      engine = job.config?.tracks?.length > 5 ? 'remotion' : 'shotstack';
      console.log(`🤖 Auto-selected engine: ${engine}`);
    }

    let renderId: string;
    let renderResult: any;

    // Execute rendering based on engine
    if (engine === 'remotion') {
      console.log('🎥 Using Remotion for rendering...');
      
      // Update progress: rendering stage
      if (job.project_id) {
        await supabase
          .from('video_creations')
          .update({
            progress_stage: 'rendering',
            progress_percentage: 30
          })
          .eq('id', job.project_id);
      }

      // Call Remotion render function
      const { data: remotionData, error: remotionError } = await supabase.functions.invoke(
        'render-with-remotion',
        {
          body: {
            project_id: job.project_id,
            template_id: job.template_id,
            config: job.config
          }
        }
      );

      if (remotionError) throw remotionError;
      renderId = remotionData.render_id;
      renderResult = remotionData;

    } else if (engine === 'shotstack') {
      console.log('🎬 Using Shotstack for rendering...');
      
      // Update progress: rendering stage
      if (job.project_id) {
        await supabase
          .from('video_creations')
          .update({
            progress_stage: 'rendering',
            progress_percentage: 30
          })
          .eq('id', job.project_id);
      }

      // Call Shotstack render function
      const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
      if (!shotstackApiKey) {
        throw new Error('SHOTSTACK_API_KEY not configured');
      }

      const shotstackResponse = await fetch('https://api.shotstack.io/v1/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': shotstackApiKey
        },
        body: JSON.stringify(job.config)
      });

      if (!shotstackResponse.ok) {
        const errorData = await shotstackResponse.json();
        throw new Error(`Shotstack API error: ${errorData.message}`);
      }

      const shotstackData = await shotstackResponse.json();
      renderId = shotstackData.response.id;
      renderResult = shotstackData;
    } else {
      throw new Error(`Unknown rendering engine: ${engine}`);
    }

    console.log(`✅ Render initiated: ${renderId}`);

    // Update render queue with render_id
    await supabase
      .from('render_queue')
      .update({
        render_id: renderId,
        render_data: renderResult
      })
      .eq('id', job.id);

    // Update video creation with render_id and progress
    if (job.project_id) {
      await supabase
        .from('video_creations')
        .update({
          render_id: renderId,
          progress_stage: 'rendering',
          progress_percentage: 50,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.project_id);
    }

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (5 sec intervals)
    let completed = false;
    let outputUrl: string | null = null;

    while (attempts < maxAttempts && !completed) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      let status: string;
      
      if (engine === 'shotstack') {
        // Check Shotstack status
        const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
        const statusResponse = await fetch(`https://api.shotstack.io/v1/render/${renderId}`, {
          headers: { 'x-api-key': shotstackApiKey! }
        });

        const statusData = await statusResponse.json();
        status = statusData.response.status;
        outputUrl = statusData.response.url;

        // Update progress based on status
        const progressMap: Record<string, number> = {
          'queued': 50,
          'fetching': 60,
          'rendering': 75,
          'saving': 90,
          'done': 100
        };

        if (job.project_id) {
          await supabase
            .from('video_creations')
            .update({
              progress_percentage: progressMap[status] || 50
            })
            .eq('id', job.project_id);
        }

      } else {
        // Check Remotion status via Supabase function
        const { data: statusData } = await supabase.functions.invoke(
          'check-render-status',
          { body: { render_id: renderId } }
        );
        
        status = statusData?.status || 'rendering';
        outputUrl = statusData?.output_url;
      }

      if (status === 'done' || status === 'completed') {
        completed = true;
        console.log(`✅ Render completed: ${outputUrl}`);

        // Update render queue to completed
        await supabase
          .from('render_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            output_url: outputUrl
          })
          .eq('id', job.id);

        // Update video creation to completed
        if (job.project_id) {
          // Get user_id from project
          const { data: project } = await supabase
            .from('video_creations')
            .select('user_id')
            .eq('id', job.project_id)
            .single();

          await supabase
            .from('video_creations')
            .update({
              status: 'completed',
              output_url: outputUrl,
              progress_stage: 'completed',
              progress_percentage: 100,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.project_id);

          // Track storage file (estimate 50MB for video)
          if (project?.user_id) {
            await supabase
              .from('storage_files')
              .insert({
                user_id: project.user_id,
                bucket_name: 'video-assets',
                file_path: outputUrl,
                file_size_mb: 50, // Estimate
                file_type: 'video/mp4',
                project_id: job.project_id
              });

            // Recalculate storage usage
            await supabase.functions.invoke('calculate-storage-usage', {
              body: { user_id: project.user_id }
            });
          }

          // Trigger thumbnail generation
          await supabase.functions.invoke('generate-video-thumbnail', {
            body: {
              project_id: job.project_id,
              video_url: outputUrl,
              user_id: project?.user_id
            }
          });
        }

      } else if (status === 'failed') {
        throw new Error('Rendering failed');
      }
    }

    if (!completed) {
      throw new Error('Rendering timeout');
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        render_id: renderId,
        output_url: outputUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error processing render:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Mark job as failed
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { job } = await req.json();
      
      await supabase
        .from('render_queue')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);

      if (job.project_id) {
        await supabase
          .from('video_creations')
          .update({
            status: 'failed',
            error_message: errorMessage,
            progress_stage: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', job.project_id);
      }
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
