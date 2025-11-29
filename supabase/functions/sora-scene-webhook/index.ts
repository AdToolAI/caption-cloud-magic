import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("[Sora Scene Webhook] Received:", JSON.stringify(payload, null, 2));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const predictionId = payload.id;
    const status = payload.status;
    const output = payload.output;

    // Find the scene by prediction ID
    const { data: scene, error: fetchError } = await supabase
      .from('sora_long_form_scenes')
      .select('*, sora_long_form_projects!inner(id, user_id)')
      .eq('replicate_prediction_id', predictionId)
      .single();

    if (fetchError || !scene) {
      console.error("[Sora Scene Webhook] Scene not found for prediction:", predictionId);
      return new Response(
        JSON.stringify({ error: "Scene not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (status === "succeeded" && output) {
      // Get the video URL (Sora returns array or single URL)
      const videoUrl = Array.isArray(output) ? output[0] : output;

      // Update scene with completed video
      const { error: updateError } = await supabase
        .from('sora_long_form_scenes')
        .update({
          status: 'completed',
          generated_video_url: videoUrl,
        })
        .eq('id', scene.id);

      if (updateError) throw updateError;

      console.log(`[Sora Scene Webhook] Scene ${scene.scene_order} completed: ${videoUrl}`);

      // Check if all scenes are completed
      const { data: allScenes } = await supabase
        .from('sora_long_form_scenes')
        .select('status')
        .eq('project_id', scene.project_id);

      const allCompleted = allScenes?.every(s => s.status === 'completed');
      const anyFailed = allScenes?.some(s => s.status === 'failed');

      if (allCompleted) {
        await supabase
          .from('sora_long_form_projects')
          .update({ status: 'draft' }) // Ready for transitions/export
          .eq('id', scene.project_id);
        
        console.log(`[Sora Scene Webhook] All scenes completed for project ${scene.project_id}`);
      } else if (anyFailed) {
        // Keep generating status but note partial failure
        console.log(`[Sora Scene Webhook] Some scenes failed for project ${scene.project_id}`);
      }
    } else if (status === "failed") {
      const { error: updateError } = await supabase
        .from('sora_long_form_scenes')
        .update({ status: 'failed' })
        .eq('id', scene.id);

      if (updateError) throw updateError;

      console.error(`[Sora Scene Webhook] Scene ${scene.scene_order} failed:`, payload.error);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Sora Scene Webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
