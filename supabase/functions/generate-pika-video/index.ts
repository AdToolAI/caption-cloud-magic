import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const MODEL_PRICING: Record<string, number> = {
  'pika-2-2-standard': 0.10,
  'pika-2-2-pro': 0.18,
};

// Pika 2.2 on Replicate
const REPLICATE_MODELS: Record<string, string> = {
  'pika-2-2-standard': 'pika-labs/pika-text-to-video',
  'pika-2-2-pro': 'pika-labs/pika-text-to-video',
};

interface GenerateRequest {
  prompt: string;
  model: 'pika-2-2-standard' | 'pika-2-2-pro';
  duration: number; // 5 or 10
  aspectRatio: string;
  startImageUrl?: string;
  endImageUrl?: string; // Pikaframes
  negativePrompt?: string;
}

async function rehostAndPersist(params: {
  predictionId: string;
  generationId: string;
  userId: string;
  totalCost: number;
  prompt: string;
  model: string;
  duration: number;
  aspectRatio: string;
  replicate: Replicate;
}) {
  const { predictionId, generationId, userId, totalCost, prompt, model, duration, aspectRatio, replicate } = params;
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const startedAt = Date.now();
  const MAX_POLL_MS = 8 * 60 * 1000;
  const POLL_INTERVAL_MS = 5000;

  try {
    while (Date.now() - startedAt < MAX_POLL_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const prediction = await replicate.predictions.get(predictionId);
      console.log(`[generate-pika-video] Pred ${predictionId} status=${prediction.status}`);

      if (prediction.status === 'succeeded') {
        const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        if (!outputUrl) throw new Error("Pika succeeded but returned no output URL");

        let permanentUrl = outputUrl as string;
        try {
          const dl = await fetch(outputUrl as string);
          if (!dl.ok) throw new Error(`Download failed: ${dl.status}`);
          const buf = await dl.arrayBuffer();
          const fileName = `${userId}/${generationId}.mp4`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("ai-videos")
            .upload(fileName, buf, { contentType: "video/mp4", upsert: true });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabaseAdmin.storage.from("ai-videos").getPublicUrl(fileName);
          permanentUrl = publicUrl;
        } catch (storageErr) {
          console.error("[generate-pika-video] Storage rehost failed, keeping Replicate URL:", storageErr);
        }

        await supabaseAdmin
          .from("ai_video_generations")
          .update({
            status: "completed",
            video_url: permanentUrl,
            completed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", generationId);

        await supabaseAdmin.from("video_creations").insert({
          user_id: userId,
          template_id: null,
          output_url: permanentUrl,
          status: "completed",
          metadata: {
            ai_generation_id: generationId,
            model,
            prompt,
            aspect_ratio: aspectRatio,
            duration_seconds: duration,
            source: "pika-2-2",
          },
          credits_used: 0,
        });

        console.log(`[generate-pika-video] ✅ Completed ${generationId}`);
        return;
      }

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(prediction.error?.toString() ?? `Pika ${prediction.status}`);
      }
    }
    throw new Error(`Pika prediction timed out after ${Math.round(MAX_POLL_MS / 1000)}s`);
  } catch (err: any) {
    console.error(`[generate-pika-video] ❌ Failure:`, err?.message ?? err);
    await supabaseAdmin
      .from("ai_video_generations")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_message: err?.message ?? "Pika generation failed",
      })
      .eq("id", generationId);

    const { error: refundError } = await supabaseAdmin.rpc("refund_ai_video_credits", {
      p_user_id: userId,
      p_amount_euros: totalCost,
      p_generation_id: generationId,
    });
    if (refundError) {
      console.error("[generate-pika-video] Refund failed:", refundError);
    } else {
      console.log(`[generate-pika-video] ✅ Refunded €${totalCost.toFixed(2)}`);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Bond QA Agent: short-circuit on x-qa-mock header (no provider call, no credits)
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  // Pika 2.2 was removed from Replicate (May 2026). Until we wire up the
  // direct Pika API (or a replacement provider), this endpoint short-circuits
  // BEFORE any wallet deduction, so users never get charged for a 404.
  return new Response(
    JSON.stringify({
      error: "Pika 2.2 ist derzeit nicht verfügbar (Provider-Migration in Arbeit).",
      code: "PROVIDER_DEPRECATED",
      provider: "pika",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );

  // ---------- legacy code below kept for reference; unreachable ----------
  /* eslint-disable */

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = (await req.json()) as GenerateRequest;
    const { prompt, model, duration, aspectRatio, startImageUrl, endImageUrl, negativePrompt } = body;

    const replicateModel = REPLICATE_MODELS[model];
    const costPerSecond = MODEL_PRICING[model];
    if (!replicateModel || !costPerSecond) {
      return new Response(JSON.stringify({ error: `Unknown Pika model: ${model}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (![5, 10].includes(duration)) {
      return new Response(JSON.stringify({ error: "Duration must be 5 or 10 seconds." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!prompt || prompt.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Prompt is required (min 3 chars)." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Wallet check
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("balance_euros, currency")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: "No AI Video wallet found.", code: "NO_WALLET", needsPurchase: true }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const totalCost = duration * costPerSecond;
    const sym = wallet.currency === "USD" ? "$" : "€";
    if (wallet.balance_euros < totalCost) {
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${sym}${totalCost.toFixed(2)}, have ${sym}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS", needsPurchase: true,
          required: totalCost, available: wallet.balance_euros, currency: wallet.currency,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Rate limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("ai_video_generations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneHourAgo);
    if (count && count >= 10) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Max 10 videos per hour.", retryAfter: 3600 }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create generation row
    const { data: generation, error: genError } = await supabaseAdmin
      .from("ai_video_generations")
      .insert({
        user_id: user.id,
        prompt,
        model,
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        resolution: model === 'pika-2-2-pro' ? '1080p' : '720p',
        cost_per_second: costPerSecond,
        total_cost_euros: totalCost,
        status: "pending",
        source_image_url: startImageUrl ?? null,
      })
      .select()
      .single();
    if (genError) throw genError;

    // Deduct credits
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      "deduct_ai_video_credits",
      { p_user_id: user.id, p_amount: totalCost, p_generation_id: generation.id },
    );
    if (deductError || newBalance === null || newBalance === undefined) {
      await supabaseAdmin
        .from("ai_video_generations")
        .update({ status: "failed", error_message: "Failed to deduct credits" })
        .eq("id", generation.id);
      throw new Error("Failed to deduct credits");
    }

    // Submit to Replicate
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY") ?? Deno.env.get("REPLICATE_API_TOKEN");
    if (!REPLICATE_API_KEY) throw new Error("REPLICATE_API_KEY not configured");
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Pika 2.2 input
    const pikaInput: Record<string, unknown> = {
      prompt,
      seed: Math.floor(Math.random() * 1_000_000),
      aspect_ratio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '1:1' ? '1:1' : '16:9',
      // duration is generally 5 or 10s on Pika 2.2
      duration,
    };
    if (negativePrompt) pikaInput.negative_prompt = negativePrompt;
    if (startImageUrl) pikaInput.first_frame_image = startImageUrl;
    if (endImageUrl) pikaInput.last_frame_image = endImageUrl; // Pikaframes

    let prediction;
    try {
      prediction = await replicate.predictions.create({
        model: replicateModel,
        input: pikaInput,
      });
    } catch (err: any) {
      console.error("[generate-pika-video] ❌ Submit failed:", err);
      await supabaseAdmin
        .from("ai_video_generations")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: err?.message ?? "Pika submit failed",
        })
        .eq("id", generation.id);
      await supabaseAdmin.rpc("refund_ai_video_credits", {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: generation.id,
      });
      return new Response(
        JSON.stringify({ error: "Pika submission failed. Credits refunded.", code: "PIKA_ERROR", details: err?.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabaseAdmin
      .from("ai_video_generations")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        artlist_job_id: prediction.id,
      })
      .eq("id", generation.id);

    // Background poll & rehost
    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(
      rehostAndPersist({
        predictionId: prediction.id,
        generationId: generation.id,
        userId: user.id,
        totalCost,
        prompt,
        model,
        duration,
        aspectRatio,
        replicate,
      }),
    );

    return new Response(
      JSON.stringify({
        success: true,
        generationId: generation.id,
        predictionId: prediction.id,
        cost: totalCost,
        currency: wallet.currency,
        newBalance,
        status: "processing",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("[generate-pika-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
  /* eslint-enable */
});
