import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function errorResponse(step: string, error: string, statusCode: number) {
  console.error(`[save-ai-video] FAILED at step="${step}":`, error);
  return new Response(
    JSON.stringify({ ok: false, step, error }),
    { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { generation_id } = await req.json();

    if (!generation_id) {
      return errorResponse("validation", "generation_id is required", 400);
    }

    console.log("[save-ai-video] Step: auth");
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("auth", "No authorization header", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return errorResponse("auth", "Unauthorized", 401);
    }
    console.log("[save-ai-video] Step: auth OK, user:", user.id);

    // Step: fetch_generation
    console.log("[save-ai-video] Step: fetch_generation, id:", generation_id);
    const { data: generation, error: fetchError } = await supabaseClient
      .from("ai_video_generations")
      .select("*")
      .eq("id", generation_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !generation) {
      return errorResponse("fetch_generation", "Video generation not found", 404);
    }
    console.log("[save-ai-video] Step: fetch_generation OK, status:", generation.status);

    if (generation.status !== "completed" || !generation.video_url) {
      return errorResponse("fetch_generation", "Video is not ready yet", 400);
    }

    // Step: existing_check — use contains instead of fragile eq on JSON path
    console.log("[save-ai-video] Step: existing_check");
    const { data: existingVideos, error: existingError } = await supabaseClient
      .from("video_creations")
      .select("id")
      .eq("user_id", user.id)
      .contains("metadata", { ai_generation_id: generation_id });

    if (existingError) {
      console.error("[save-ai-video] existing_check query error:", existingError);
      // Don't fail, just skip the check
    }

    if (existingVideos && existingVideos.length > 0) {
      console.log("[save-ai-video] Already saved, id:", existingVideos[0].id);
      return new Response(
        JSON.stringify({ ok: true, message: "Video already in library", video_id: existingVideos[0].id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("[save-ai-video] Step: existing_check OK — not yet saved");

    // Step: download_source
    console.log("[save-ai-video] Step: download_source, url:", generation.video_url);
    let videoResponse: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
      videoResponse = await fetch(generation.video_url, { signal: controller.signal });
      clearTimeout(timeout);
    } catch (fetchErr) {
      console.error("[save-ai-video] download_source fetch error:", fetchErr);
      return errorResponse(
        "download_source",
        "Video nicht mehr verfügbar — die temporäre URL ist abgelaufen. Bitte generiere das Video erneut.",
        410
      );
    }

    if (!videoResponse.ok) {
      console.error("[save-ai-video] download_source HTTP error:", videoResponse.status, videoResponse.statusText);
      return errorResponse(
        "download_source",
        "Video nicht mehr verfügbar — die temporäre URL ist abgelaufen. Bitte generiere das Video erneut.",
        410
      );
    }

    const videoBlob = await videoResponse.blob();
    const videoBuffer = await videoBlob.arrayBuffer();
    console.log("[save-ai-video] Step: download_source OK, size:", videoBuffer.byteLength, "bytes");

    // Step: upload_storage
    console.log("[save-ai-video] Step: upload_storage");
    const fileName = `${user.id}/${generation_id}.mp4`;
    const { error: uploadError } = await supabaseClient.storage
      .from("ai-videos")
      .upload(fileName, videoBuffer, {
        contentType: "video/mp4",
        upsert: true
      });

    if (uploadError) {
      console.error("[save-ai-video] upload_storage error:", uploadError);
      return errorResponse("upload_storage", `Upload fehlgeschlagen: ${uploadError.message}`, 500);
    }
    console.log("[save-ai-video] Step: upload_storage OK");

    // Step: get public URL
    const { data: { publicUrl } } = supabaseClient.storage
      .from("ai-videos")
      .getPublicUrl(fileName);
    console.log("[save-ai-video] Step: public_url OK:", publicUrl);

    // Step: create_library_entry
    console.log("[save-ai-video] Step: create_library_entry");
    const { data: newVideo, error: insertError } = await supabaseClient
      .from("video_creations")
      .insert({
        user_id: user.id,
        output_url: publicUrl,
        status: "completed",
        metadata: {
          ai_generation_id: generation_id,
          model: generation.model,
          prompt: generation.prompt,
          aspect_ratio: generation.aspect_ratio,
          resolution: generation.resolution,
          duration_seconds: generation.duration_seconds,
          source: "sora-2-ai"
        },
        credits_used: 0
      })
      .select()
      .single();

    if (insertError) {
      console.error("[save-ai-video] create_library_entry error:", JSON.stringify(insertError));
      return errorResponse("create_library_entry", `Bibliothekseintrag fehlgeschlagen: ${insertError.message}`, 500);
    }
    console.log("[save-ai-video] Step: create_library_entry OK, id:", newVideo.id);

    return new Response(
      JSON.stringify({ ok: true, message: "Video saved to library successfully", video_id: newVideo.id, video_url: publicUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[save-ai-video] Unexpected error:", error);
    return errorResponse(
      "unknown",
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
});
