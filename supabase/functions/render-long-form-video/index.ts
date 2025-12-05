import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RenderRequest {
  projectId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId } = await req.json() as RenderRequest;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch project and scenes
    const { data: project, error: projectError } = await supabase
      .from('sora_long_form_projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new Error("Project not found");
    }

    const { data: scenes, error: scenesError } = await supabase
      .from('sora_long_form_scenes')
      .select('*')
      .eq('project_id', projectId)
      .order('scene_order');

    if (scenesError || !scenes || scenes.length === 0) {
      throw new Error("No scenes found");
    }

    // Verify all scenes are completed
    const incompleteScenes = scenes.filter(s => s.status !== 'completed');
    if (incompleteScenes.length > 0) {
      throw new Error(`${incompleteScenes.length} scenes are not yet completed`);
    }

    console.log(`[Long-Form Render] Starting render for ${scenes.length} scenes`);

    // Calculate total cost and duration
    const totalCost = scenes.reduce((sum, s) => sum + (s.cost_euros || 0), 0);
    const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 0), 0);

    // Prepare scenes data for Remotion
    const remotionScenes = scenes.map(scene => ({
      videoUrl: scene.generated_video_url,
      duration: scene.duration,
      transitionType: scene.transition_type || 'none',
      transitionDuration: scene.transition_duration || 0.5,
    }));

    console.log(`[Long-Form Render] Prepared ${remotionScenes.length} scenes for Remotion`);
    console.log(`[Long-Form Render] Total duration: ${totalDuration}s`);

    // Determine dimensions based on aspect ratio
    let width = 1920;
    let height = 1080;
    if (project.aspect_ratio === '9:16') {
      width = 1080;
      height = 1920;
    } else if (project.aspect_ratio === '1:1') {
      width = 1080;
      height = 1080;
    }

    // Update project status to rendering
    await supabase
      .from('sora_long_form_projects')
      .update({ status: 'rendering' })
      .eq('id', projectId);

    // Get authorization header for internal function call
    const authHeader = req.headers.get('Authorization');

    // Call render-with-remotion to concatenate all scenes
    const renderResponse = await fetch(`${SUPABASE_URL}/functions/v1/render-with-remotion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        component_name: 'LongFormVideo',
        project_id: projectId,
        customizations: {
          scenes: remotionScenes,
          fps: 30,
          aspectRatio: project.aspect_ratio,
        },
        format: 'mp4',
        aspect_ratio: project.aspect_ratio,
        quality: 'hd',
        targetWidth: width,
        targetHeight: height,
        durationInFrames: Math.ceil(totalDuration * 30),
      }),
    });

    if (!renderResponse.ok) {
      const errorText = await renderResponse.text();
      console.error('[Long-Form Render] Remotion render failed:', errorText);
      
      // Update project status to failed
      await supabase
        .from('sora_long_form_projects')
        .update({ status: 'failed' })
        .eq('id', projectId);
      
      throw new Error(`Remotion render failed: ${errorText}`);
    }

    const renderResult = await renderResponse.json();
    console.log('[Long-Form Render] Remotion render initiated:', renderResult);

    // Store render tracking info
    const renderId = renderResult.renderId || renderResult.render_id;
    const bucketName = renderResult.bucketName || renderResult.bucket_name;

    // Update project with render tracking
    await supabase
      .from('sora_long_form_projects')
      .update({
        status: 'rendering',
        total_cost_euros: totalCost,
      })
      .eq('id', projectId);

    // Save render tracking to a separate table or metadata
    // For now, we'll start polling for completion
    if (renderId) {
      console.log(`[Long-Form Render] Tracking render ID: ${renderId}`);
      
      // Start background polling for render completion
      // The frontend will also poll for status updates
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: 'rendering',
        renderId,
        bucketName,
        totalCost,
        sceneCount: scenes.length,
        totalDuration,
        message: `Rendering ${scenes.length} scenes (${totalDuration}s total). This may take 5-10 minutes.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Long-Form Render] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
