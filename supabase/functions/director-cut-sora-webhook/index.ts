import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload, null, 2));

    const { id: predictionId, status, output, error: replicateError } = payload;

    // Find enhancement record by prediction ID
    const { data: enhancement, error: findError } = await supabaseAdmin
      .from("director_cut_enhancements")
      .select("*")
      .eq("replicate_prediction_id", predictionId)
      .single();

    if (findError || !enhancement) {
      console.error("Enhancement not found for prediction:", predictionId);
      return new Response(JSON.stringify({ error: "Enhancement not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing webhook for enhancement ${enhancement.id}, status: ${status}`);

    if (status === "succeeded" && output) {
      // Get the video URL from output (can be string or array)
      const videoUrl = Array.isArray(output) ? output[0] : output;
      
      console.log("Enhancement completed, video URL:", videoUrl);

      // Update enhancement record
      const { error: updateError } = await supabaseAdmin
        .from("director_cut_enhancements")
        .update({
          status: "completed",
          generated_video_url: videoUrl,
          completed_at: new Date().toISOString(),
        })
        .eq("id", enhancement.id);

      if (updateError) {
        console.error("Update error:", updateError);
      }

    } else if (status === "failed") {
      console.error("Enhancement failed:", replicateError);

      // Update status to failed
      await supabaseAdmin
        .from("director_cut_enhancements")
        .update({
          status: "failed",
          error_message: replicateError || "Unknown error",
        })
        .eq("id", enhancement.id);

      // Refund credits
      const { error: refundError } = await supabaseAdmin.rpc("refund_ai_video_credits", {
        p_user_id: enhancement.user_id,
        p_amount_euros: enhancement.cost_euros,
        p_generation_id: enhancement.id,
      });

      if (refundError) {
        console.error("Refund error:", refundError);
      } else {
        console.log(`Refunded ${enhancement.cost_euros}€ for failed enhancement`);
      }
    } else if (status === "processing" || status === "starting") {
      // Update status
      await supabaseAdmin
        .from("director_cut_enhancements")
        .update({ status: "processing" })
        .eq("id", enhancement.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
