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

      try {
        // 1. Download video from Replicate
        console.log("Downloading video from Replicate...");
        const videoResponse = await fetch(videoUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: ${videoResponse.status}`);
        }
        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`Downloaded video: ${videoBuffer.byteLength} bytes`);

        // 2. Upload to Supabase Storage
        const fileName = `${enhancement.user_id}/enhancement-${enhancement.id}.mp4`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("ai-videos")
          .upload(fileName, videoBuffer, {
            contentType: "video/mp4",
            upsert: true
          });

        if (uploadError) {
          console.error("Storage upload error:", uploadError);
          throw uploadError;
        }
        console.log("Video uploaded to storage:", fileName);

        // 3. Get public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
          .from("ai-videos")
          .getPublicUrl(fileName);
        console.log("Public URL:", publicUrl);

        // 4. Update enhancement record with storage URL
        const { error: updateError } = await supabaseAdmin
          .from("director_cut_enhancements")
          .update({
            status: "completed",
            generated_video_url: publicUrl,
            completed_at: new Date().toISOString(),
          })
          .eq("id", enhancement.id);

        if (updateError) {
          console.error("Update error:", updateError);
        }

        // 5. Create video_creations entry for MediaLibrary
        const { error: creationError } = await supabaseAdmin
          .from("video_creations")
          .insert({
            user_id: enhancement.user_id,
            output_url: publicUrl,
            status: "completed",
            metadata: {
              source: "director-cut-enhancement",
              enhancement_id: enhancement.id,
              scene_id: enhancement.scene_id,
              project_id: enhancement.project_id,
              prompt: enhancement.prompt,
              model: enhancement.model,
              duration_seconds: enhancement.duration_seconds,
              original_frame_url: enhancement.original_frame_url,
              cost_euros: enhancement.cost_euros,
            },
            credits_used: 0, // Already paid via AI Wallet
          });

        if (creationError) {
          console.error("video_creations insert error:", creationError);
        } else {
          console.log("Video saved to MediaLibrary (video_creations)");
        }

      } catch (storageError) {
        console.error("Storage/creation error:", storageError);
        
        // Still update enhancement with original Replicate URL as fallback
        await supabaseAdmin
          .from("director_cut_enhancements")
          .update({
            status: "completed",
            generated_video_url: videoUrl,
            completed_at: new Date().toISOString(),
          })
          .eq("id", enhancement.id);
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
