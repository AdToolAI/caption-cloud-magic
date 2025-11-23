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
    const { generation_id } = await req.json();

    if (!generation_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "generation_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get auth header and verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the AI video generation
    const { data: generation, error: fetchError } = await supabaseClient
      .from("ai_video_generations")
      .select("*")
      .eq("id", generation_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !generation) {
      return new Response(
        JSON.stringify({ ok: false, error: "Video generation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (generation.status !== "completed" || !generation.video_url) {
      return new Response(
        JSON.stringify({ ok: false, error: "Video is not ready yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already saved to library
    const { data: existingVideo } = await supabaseClient
      .from("video_creations")
      .select("id")
      .eq("user_id", user.id)
      .eq("metadata->ai_generation_id", generation_id)
      .single();

    if (existingVideo) {
      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: "Video already in library", 
          video_id: existingVideo.id 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download video from Replicate
    console.log("Downloading video from:", generation.video_url);
    const videoResponse = await fetch(generation.video_url);
    if (!videoResponse.ok) {
      throw new Error("Failed to download video from Replicate");
    }

    const videoBlob = await videoResponse.blob();
    const videoBuffer = await videoBlob.arrayBuffer();

    // Create bucket if it doesn't exist
    const { data: buckets } = await supabaseClient.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === "ai-videos");
    
    if (!bucketExists) {
      await supabaseClient.storage.createBucket("ai-videos", {
        public: true,
        fileSizeLimit: 524288000, // 500MB
        allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime"]
      });
    }

    // Upload to storage
    const fileName = `${user.id}/${generation_id}.mp4`;
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from("ai-videos")
      .upload(fileName, videoBuffer, {
        contentType: "video/mp4",
        upsert: true
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload video: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseClient.storage
      .from("ai-videos")
      .getPublicUrl(fileName);

    // Create video_creations entry
    const { data: newVideo, error: insertError } = await supabaseClient
      .from("video_creations")
      .insert({
        user_id: user.id,
        template_id: null, // AI videos don't have templates
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
        credits_used: 0, // Already paid via AI credits
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error(`Failed to create library entry: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: "Video saved to library successfully",
        video_id: newVideo.id,
        video_url: publicUrl
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
