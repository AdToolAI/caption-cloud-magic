import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CREDITS_PER_SECOND = { 'sora-2-standard': 25, 'sora-2-pro': 53 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    console.log("[Sora Webhook] Received:", JSON.stringify(payload, null, 2));

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { id: predictionId, status, output } = payload;

    const { data: scene, error: fetchError } = await supabase
      .from('sora_long_form_scenes')
      .select('*, sora_long_form_projects!inner(id, user_id, model)')
      .eq('replicate_prediction_id', predictionId)
      .single();

    if (fetchError || !scene) {
      console.error("[Webhook] Scene not found:", predictionId);
      return new Response(JSON.stringify({ error: "Scene not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const project = scene.sora_long_form_projects;

    if (status === "succeeded" && output) {
      const videoUrl = Array.isArray(output) ? output[0] : output;
      await supabase.from('sora_long_form_scenes').update({ status: 'completed', generated_video_url: videoUrl }).eq('id', scene.id);
      console.log(`[Webhook] Scene ${scene.scene_order} completed: ${videoUrl}`);

      const { data: allScenes } = await supabase.from('sora_long_form_scenes').select('status').eq('project_id', scene.project_id);
      const allCompleted = allScenes?.every(s => s.status === 'completed');
      
      if (allCompleted) {
        await supabase.from('sora_long_form_projects').update({ status: 'draft' }).eq('id', scene.project_id);
        console.log(`[Webhook] All scenes completed for project ${scene.project_id}`);
      }
    } else if (status === "failed") {
      await supabase.from('sora_long_form_scenes').update({ status: 'failed' }).eq('id', scene.id);
      console.error(`[Webhook] Scene ${scene.scene_order} failed:`, payload.error);

      // Auto-refund for failed scene
      const sceneDuration = scene.duration || 8;
      const model = project.model || 'sora-2-standard';
      const creditsPerSecond = CREDITS_PER_SECOND[model as keyof typeof CREDITS_PER_SECOND] || 25;
      const refundAmount = sceneDuration * creditsPerSecond;

      console.log(`[Webhook] Refunding ${refundAmount} credits (${sceneDuration}s × ${creditsPerSecond})`);

      const { data: newBalance, error: refundError } = await supabase.rpc('increment_balance', { p_user_id: project.user_id, p_amount: refundAmount });

      if (refundError) {
        console.error(`[Webhook] Refund failed:`, refundError);
      } else {
        console.log(`[Webhook] Refunded. New balance: ${newBalance}`);
        await supabase.from('user_credit_transactions').insert({
          user_id: project.user_id,
          amount: refundAmount,
          type: 'refund',
          description: `Sora 2 Scene ${scene.scene_order} fehlgeschlagen - automatische Rückerstattung`,
          metadata: { project_id: scene.project_id, scene_id: scene.id, scene_order: scene.scene_order, duration: sceneDuration, model },
        });
      }

      // Check project status
      const { data: allScenes } = await supabase.from('sora_long_form_scenes').select('status').eq('project_id', scene.project_id);
      const allDone = allScenes?.every(s => s.status === 'completed' || s.status === 'failed');
      const anyCompleted = allScenes?.some(s => s.status === 'completed');
      const allFailed = allScenes?.every(s => s.status === 'failed');

      if (allDone) {
        if (allFailed) {
          await supabase.from('sora_long_form_projects').update({ status: 'failed' }).eq('id', scene.project_id);
        } else if (anyCompleted) {
          await supabase.from('sora_long_form_projects').update({ status: 'draft' }).eq('id', scene.project_id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
