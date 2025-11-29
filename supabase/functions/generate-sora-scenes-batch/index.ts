import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BatchRequest {
  projectId: string;
  model: 'sora-2-standard' | 'sora-2-pro';
  aspectRatio: '16:9' | '9:16' | '1:1';
  sceneIds?: string[]; // Optional: only regenerate specific scenes
}

const SORA_MODELS = {
  'sora-2-standard': '96d31e18e9da8d72ce794ebe800c459814e83508cf95230744c5139e089e2331',
  'sora-2-pro': '4b88384943c04009e691011b2e42f9c7a7fe2c67036a68d6e9af153eb8210d1f',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, model, aspectRatio, sceneIds } = await req.json() as BatchRequest;

    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!REPLICATE_API_KEY) {
      throw new Error("REPLICATE_API_KEY not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Fetch scenes to generate
    let query = supabase
      .from('sora_long_form_scenes')
      .select('*')
      .eq('project_id', projectId)
      .order('scene_order');

    if (sceneIds && sceneIds.length > 0) {
      query = query.in('id', sceneIds);
    }

    const { data: scenes, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!scenes || scenes.length === 0) {
      throw new Error("No scenes found for project");
    }

    console.log(`[Batch Generation] Starting ${scenes.length} scenes for project ${projectId}`);

    // Map aspect ratio to Sora format
    const soraAspectRatio = aspectRatio === '9:16' ? 'portrait' : 'landscape';

    // Start all predictions in parallel
    const predictions = await Promise.all(
      scenes.map(async (scene) => {
        try {
          // Build input
          const input: any = {
            prompt: scene.prompt,
            duration: scene.duration,
            aspect_ratio: soraAspectRatio,
          };

          // Add reference image if exists (Image-to-Video)
          if (scene.reference_image_url) {
            input.input_reference = scene.reference_image_url;
          }

          console.log(`[Scene ${scene.scene_order}] Starting prediction with ${scene.duration}s`);

          const prediction = await replicate.predictions.create({
            version: SORA_MODELS[model],
            input,
            webhook: `${SUPABASE_URL}/functions/v1/sora-scene-webhook`,
            webhook_events_filter: ["completed"],
          });

          // Update scene with prediction ID
          await supabase
            .from('sora_long_form_scenes')
            .update({
              replicate_prediction_id: prediction.id,
              status: 'generating',
            })
            .eq('id', scene.id);

          return { sceneId: scene.id, predictionId: prediction.id, status: 'started' };
        } catch (error) {
          console.error(`[Scene ${scene.scene_order}] Error:`, error);
          
          await supabase
            .from('sora_long_form_scenes')
            .update({ status: 'failed' })
            .eq('id', scene.id);

          return { sceneId: scene.id, status: 'failed', error: String(error) };
        }
      })
    );

    const started = predictions.filter(p => p.status === 'started').length;
    const failed = predictions.filter(p => p.status === 'failed').length;

    console.log(`[Batch Generation] Started: ${started}, Failed: ${failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        started,
        failed,
        predictions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Batch Generation] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
