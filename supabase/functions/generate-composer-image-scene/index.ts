// generate-composer-image-scene v1.0.0
// Generates a single still image per Composer scene via Lovable AI Gateway
// (Gemini Nano Banana 2). The image is uploaded to the `composer-uploads`
// bucket under {userId}/{projectId}/scene-{sceneId}.png and the public URL
// is returned. The caller (compose-video-clips) writes that URL to
// composer_scenes.clip_url and marks clip_status = 'ready'. The scene is
// then animated in Remotion via the Ken-Burns image template.
//
// Cost: ~€0.01-0.02 per call (flat) — way cheaper than AI video.
// Models:
//   - 'standard' → google/gemini-3.1-flash-image-preview (Nano Banana 2)
//   - 'pro'      → google/gemini-3-pro-image-preview

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getVisualStyleHint } from "../_shared/composer-visual-styles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

type Quality = "standard" | "pro";

interface ImageSceneRequest {
  projectId: string;
  sceneId: string;
  prompt: string;
  visualStyle?: string;
  quality?: Quality;
  /** Optional aspect ratio hint forwarded to the image model. */
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:5";
}

const MODEL_BY_QUALITY: Record<Quality, string> = {
  standard: "google/gemini-3.1-flash-image-preview",
  pro: "google/gemini-3-pro-image-preview",
};

// IMPORTANT: Gemini image models have no `negative_prompt` parameter, and they
// also treat words like "text", "captions", "logo" as concepts to render even
// when prefixed with "no". So we DO NOT list forbidden words here. Instead we
// strip any old negative suffix from incoming prompts and append a short
// positive cue that biases the model toward clean, environment-rich frames.
const POSITIVE_CLEAN_CUE =
  ", clean photographic composition, natural environment";

function buildPrompt(rawPrompt: string, visualStyle?: string, aspectRatio?: string): string {
  const base = (rawPrompt || "cinematic still frame").trim();
  const styleHint = getVisualStyleHint(visualStyle) || "";
  const aspectHint = aspectRatio
    ? `, composed for ${aspectRatio} aspect ratio`
    : "";
  // Strip any "no on-screen text..." suffix that the wizard may have appended —
  // those words trigger the very thing we want to avoid in diffusion models.
  let result = base.replace(/,?\s*no on-screen text[\s\S]*$/i, "").trim().replace(/[,.\s]*$/, "");
  const lower = result.toLowerCase();
  if (styleHint) {
    const probe = styleHint.replace(/^,\s*/, "").slice(0, 30).toLowerCase();
    if (!lower.includes(probe)) result += styleHint;
  }
  result += aspectHint;
  if (!lower.includes("clean photographic composition")) {
    result += POSITIVE_CLEAN_CUE;
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = (await req.json()) as ImageSceneRequest;
    const { projectId, sceneId, prompt, visualStyle, quality, aspectRatio } = body;

    if (!projectId || !sceneId || !prompt) {
      return new Response(
        JSON.stringify({ error: "MISSING_FIELDS", message: "projectId, sceneId and prompt are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify ownership
    const { data: project, error: projErr } = await supabaseAdmin
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (projErr || !project) {
      return new Response(
        JSON.stringify({ error: "PROJECT_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const q: Quality = quality === "pro" ? "pro" : "standard";
    const model = MODEL_BY_QUALITY[q];
    const finalPrompt = buildPrompt(prompt, visualStyle, aspectRatio);

    console.log(`[generate-composer-image-scene] scene=${sceneId} model=${model} promptLen=${finalPrompt.length}`);

    // Mark scene as generating
    await supabaseAdmin
      .from("composer_scenes")
      .update({ clip_status: "generating", clip_quality: q, updated_at: new Date().toISOString() })
      .eq("id", sceneId);

    // Call Lovable AI Gateway — image modality
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: finalPrompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error(`[generate-composer-image-scene] AI gateway ${aiResp.status}:`, errText);
      await supabaseAdmin
        .from("composer_scenes")
        .update({ clip_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", sceneId);
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "RATE_LIMIT", message: "Too many requests. Please retry shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "PAYMENT_REQUIRED", message: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI_GATEWAY_ERROR", status: aiResp.status }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResp.json();
    const imageDataUrl: string | undefined =
      aiData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      console.error("[generate-composer-image-scene] No image in response", JSON.stringify(aiData).slice(0, 500));
      await supabaseAdmin
        .from("composer_scenes")
        .update({ clip_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", sceneId);
      return new Response(
        JSON.stringify({ error: "NO_IMAGE_RETURNED" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode base64 → bytes
    const match = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image data URL");
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const base64 = match[2];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    // Upload to composer-uploads bucket
    const path = `${user.id}/${projectId}/scene-${sceneId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("composer-uploads")
      .upload(path, bytes, {
        contentType: `image/${match[1]}`,
        cacheControl: "3600",
        upsert: true,
      });
    if (upErr) {
      console.error("[generate-composer-image-scene] storage upload failed:", upErr);
      await supabaseAdmin
        .from("composer_scenes")
        .update({ clip_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", sceneId);
      throw upErr;
    }

    const { data: pub } = supabaseAdmin.storage.from("composer-uploads").getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    if (!publicUrl) throw new Error("Failed to get public URL");

    // Persist on the scene
    await supabaseAdmin
      .from("composer_scenes")
      .update({
        clip_url: publicUrl,
        clip_status: "ready",
        upload_type: "image",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);

    console.log(`[generate-composer-image-scene] scene=${sceneId} → ${publicUrl}`);

    return new Response(
      JSON.stringify({ success: true, sceneId, clipUrl: publicUrl, model }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[generate-composer-image-scene] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
