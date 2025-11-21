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
    const { projectId, formatConfig, contentConfig, subtitleConfig } = await req.json();

    if (!projectId || !formatConfig || !contentConfig || !subtitleConfig) {
      throw new Error('Missing required parameters');
    }

    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Generate unique render ID
    const renderId = `render-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store render job in database
    const { error: insertError } = await supabase
      .from('video_renders')
      .insert({
        render_id: renderId,
        user_id: user.id,
        project_id: projectId,
        format_config: formatConfig,
        content_config: contentConfig,
        subtitle_config: subtitleConfig,
        status: 'pending',
      });

    if (insertError) {
      console.error('Error storing render job:', insertError);
      throw new Error('Failed to create render job');
    }

    // Start background rendering process
    // In a production environment, this would trigger a separate worker
    // For now, we'll simulate the process with a promise (not blocking the response)
    Promise.resolve().then(async () => {
      // Create a service role client for background operations
      const serviceSupabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      try {
        // Update status to processing
        await serviceSupabase
          .from('video_renders')
          .update({ status: 'processing', started_at: new Date().toISOString() })
          .eq('render_id', renderId);

        // Simulate rendering process
        // In production, this would call Remotion or a video rendering service
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Create a placeholder video URL
        // In production, this would be the actual rendered video
        const videoUrl = `${supabaseUrl}/storage/v1/object/public/video-assets/${projectId}/${renderId}.mp4`;

        // Update status to completed
        await serviceSupabase
          .from('video_renders')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString(),
            video_url: videoUrl,
          })
          .eq('render_id', renderId);

      } catch (error) {
        console.error('Background rendering error:', error);
        await serviceSupabase
          .from('video_renders')
          .update({ 
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('render_id', renderId);
      }
    });

    return new Response(
      JSON.stringify({ 
        renderId,
        message: 'Render job started successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error starting render:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
