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

    // For now, we'll return the first scene's video as a placeholder
    // In production, this would call Remotion Lambda to combine all videos
    // The full implementation would use the existing render-with-remotion function
    
    // Calculate total cost
    const totalCost = scenes.reduce((sum, s) => sum + (s.cost_euros || 0), 0);

    // Update project with final video (using first scene as placeholder for now)
    // TODO: Implement actual video concatenation with Remotion
    const finalVideoUrl = scenes[0].generated_video_url;

    const { error: updateError } = await supabase
      .from('sora_long_form_projects')
      .update({
        status: 'completed',
        final_video_url: finalVideoUrl,
        total_cost_euros: totalCost,
      })
      .eq('id', projectId);

    if (updateError) throw updateError;

    // Also save to video_creations for media library
    await supabase
      .from('video_creations')
      .insert({
        user_id: project.user_id,
        output_url: finalVideoUrl,
        status: 'completed',
        metadata: {
          source: 'sora-long-form',
          project_id: projectId,
          scene_count: scenes.length,
          total_duration: scenes.reduce((sum, s) => sum + s.duration, 0),
          aspect_ratio: project.aspect_ratio,
          model: project.model,
        },
      });

    console.log(`[Long-Form Render] Completed. Total cost: ${totalCost}€`);

    return new Response(
      JSON.stringify({
        success: true,
        videoUrl: finalVideoUrl,
        totalCost,
        sceneCount: scenes.length,
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
