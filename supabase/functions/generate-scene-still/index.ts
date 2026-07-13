// Stage 2 — Frame-First Pipeline
//
// Generates 1–4 still-frame variants for a Composer scene via Lovable AI Gateway
// (Gemini Nano Banana 2 by default, Pro on demand). Variants are uploaded to the
// `composer-uploads` bucket and cached in the `scene_still_frames` table so the
// user can regenerate without re-paying when prompt+project are unchanged.
//
// The caller then picks one variant → that URL is written into the scene's
// `referenceImageUrl` and used as i2v first-frame for the actual video render
// (overrides Scene-Anchor strategy → "first-frame-direct").
//
// Cost: ~€0.01-0.02 per variant.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

type Quality = "standard" | "pro";

interface SceneStillRequest {
  projectId: string;
  sceneId: string;
  prompt: string;
  variants?: number; // 1..4 (default 2)
  quality?: Quality;
  aspectRatio?: "16:9" | "9:16" | "1:1" | "4:5";
  /** Optional reference image (brand character / location) to guide composition. */
  referenceImageUrl?: string;
  /** Phase 3 — multi-image references (auto-injected from @character/@location mentions).
   *  When present, takes precedence over referenceImageUrl and is sent as a multi-image
   *  content array to Nano Banana 2 (max 4). */
  referenceImageUrls?: string[];
}

const MODEL_BY_QUALITY: Record<Quality, string> = {
  standard: "google/gemini-3.1-flash-image-preview",
  pro: "google/gemini-3-pro-image-preview",
};

async function djb2Hash(input: string): Promise<string> {
  // Tiny stable hash for prompt+ref+aspect → cache key (collision-tolerant).
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildPrompt(raw: string, aspectRatio?: string): string {
  const base = (raw || "cinematic still frame").trim().replace(/[,.\s]*$/, "");
  const aspect = aspectRatio ? `, composed for ${aspectRatio} aspect ratio` : "";
  return `${base}${aspect}, clean photographic composition, natural environment, no on-screen text or captions baked in`;
}

async function generateVariant(
  apiKey: string,
  model: string,
  prompt: string,
  referenceImageUrls: string[],
): Promise<Uint8Array | null> {
  const userContent: any =
    referenceImageUrls.length > 0
      ? [
          { type: "text", text: prompt },
          ...referenceImageUrls.slice(0, 4).map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ]
      : prompt;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: userContent }],
      modalities: ["image", "text"],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`[generate-scene-still] gateway ${resp.status}: ${txt.slice(0, 300)}`);
    if (resp.status === 429 || resp.status === 402) throw new Error(`AI_${resp.status}`);
    return null;
  }

  const data = await resp.json();
  const dataUrl: string | undefined =
    data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl?.startsWith("data:image/")) return null;
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  return Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { url: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", imageUrl: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", output: "https://storage.googleapis.com/lovable-public/qa-mock/sample-1024.jpg", predictionId: "qa-mock-image", status: "succeeded" });


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
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = (await req.json()) as SceneStillRequest;
    const {
      projectId,
      sceneId,
      prompt,
      variants = 2,
      quality = "standard",
      aspectRatio,
      referenceImageUrl,
      referenceImageUrls,
    } = body;

    if (!projectId || !sceneId || !prompt?.trim()) {
      return new Response(
        JSON.stringify({ error: "MISSING_FIELDS", message: "projectId, sceneId and prompt required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const variantCount = Math.max(1, Math.min(4, variants));

    // Merge single + multi reference inputs, dedupe, cap to 4.
    const refs = Array.from(
      new Set(
        [
          ...(Array.isArray(referenceImageUrls) ? referenceImageUrls : []),
          ...(referenceImageUrl ? [referenceImageUrl] : []),
        ].filter((u): u is string => typeof u === "string" && u.length > 0),
      ),
    ).slice(0, 4);

    // Verify project ownership
    const { data: project } = await admin
      .from("composer_projects")
      .select("id,user_id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!project) {
      return new Response(JSON.stringify({ error: "PROJECT_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalPrompt = buildPrompt(prompt, aspectRatio);
    const promptHash = await djb2Hash(`${finalPrompt}::${refs.join("|")}::${quality}::${variantCount}`);

    // Cache check
    const { data: cached } = await admin
      .from("scene_still_frames")
      .select("id, variants")
      .eq("scene_id", sceneId)
      .eq("prompt_hash", promptHash)
      .maybeSingle();

    if (cached?.variants && Array.isArray(cached.variants) && cached.variants.length > 0) {
      console.log(`[generate-scene-still] cache hit scene=${sceneId}`);
      return new Response(
        JSON.stringify({ success: true, sceneId, variants: cached.variants, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const model = MODEL_BY_QUALITY[quality];

    console.log(`[generate-scene-still] scene=${sceneId} variants=${variantCount} model=${model} refs=${refs.length}`);

    // Parallel generate
    const results = await Promise.allSettled(
      Array.from({ length: variantCount }).map(() =>
        generateVariant(apiKey, model, finalPrompt, refs),
      ),
    );

    const uploaded: Array<{ url: string; index: number }> = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled" || !r.value) continue;
      const path = `${user.id}/${projectId}/still-${sceneId}-${Date.now()}-${i}.png`;
      const { error: upErr } = await admin.storage
        .from("composer-uploads")
        .upload(path, r.value, { contentType: "image/png", upsert: true, cacheControl: "3600" });
      if (upErr) {
        console.error("[generate-scene-still] upload failed:", upErr);
        continue;
      }
      const { data: pub } = admin.storage.from("composer-uploads").getPublicUrl(path);
      if (pub?.publicUrl) uploaded.push({ url: pub.publicUrl, index: i });
    }

    if (uploaded.length === 0) {
      return new Response(
        JSON.stringify({ error: "NO_VARIANTS_GENERATED", message: "All variants failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upsert cache
    await admin
      .from("scene_still_frames")
      .upsert(
        {
          user_id: user.id,
          scene_id: sceneId,
          prompt_hash: promptHash,
          variants: uploaded,
        },
        { onConflict: "scene_id,prompt_hash" },
      );

    return new Response(
      JSON.stringify({ success: true, sceneId, variants: uploaded, cached: false, model }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[generate-scene-still] error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg === "AI_429" ? 429 : msg === "AI_402" ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
