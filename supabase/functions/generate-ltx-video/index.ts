import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { resolveAccountCostPerSecond } from "../_shared/accountVideoPricing.ts";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { capabilityGate, inferMode } from "../_shared/videoCapabilityGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// LTX 2.3 — provider cost fast $0.06/s, pro $0.08/s (3× margin)
const MODEL_PRICING: Record<string, Record<string, number>> = {
  'ltx-standard': { EUR: 0.18, USD: 0.18 },
  'ltx-pro':      { EUR: 0.24, USD: 0.24 },
};

// Lightricks LTX 2.3 — text-to-video and image-to-video with native audio
const REPLICATE_MODELS: Record<string, string> = {
  'ltx-standard': 'lightricks/ltx-2.3-fast',
  'ltx-pro': 'lightricks/ltx-2.3-pro',
};

// Capability truth lives in _shared/videoModelSpecs.ts. No local clamping:
// an unsupported duration / aspect ratio / resolution is rejected with 400.


interface GenerateRequest {
  prompt: string;
  model: 'ltx-standard' | 'ltx-pro';
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  startImageUrl?: string;
  /** LTX 2.3 last frame (needs startImageUrl). */
  endImageUrl?: string;
  /** 1080p | 2k | 4k — durations > 10 s require 1080p. */
  resolution?: '1080p' | '2k' | '4k';
  cameraMotion?: string;
  generateAudio?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Bond QA Agent: short-circuit on x-qa-mock header (no provider call, no credits)
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as GenerateRequest;
    const { prompt, model, duration: rawDuration, aspectRatio, startImageUrl, generateAudio } = body;

    const duration = Number(rawDuration);
    const isImageToVideo = !!startImageUrl;
    const requestedResolution = body.resolution ?? '1080p';

    // Capability gate — runs BEFORE wallet lookup and BEFORE any provider call.
    const gate = capabilityGate(
      {
        modelId: model,
        mode: inferMode({ startImageUrl, endImageUrl: body.endImageUrl }),
        resolution: requestedResolution,
        durationSeconds: duration,
        aspectRatio,
      },
      corsHeaders,
    );
    if (gate.response) return gate.response;

    const mode = isImageToVideo ? 'Image-to-Video' : 'Text-to-Video';
    console.log(`[generate-ltx-video] Mode: ${mode}, Duration: ${duration}s, Model: ${model}`);


    // Wallet currency
    const { data: walletPreview } = await supabaseClient
      .from('ai_video_wallets')
      .select('currency')
      .eq('user_id', user.id)
      .single();
    const currency = walletPreview?.currency || 'EUR';

    // Canonical price from the shared catalog (same source as the UI preview,
    // including the account discount). MODEL_PRICING is only a legacy fallback.
    const costPerSecond = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, model, currency as "EUR" | "USD", 0.135,
    );
    const totalCost = duration * costPerSecond;
      // [legacy] Per-user video rate limit removed (single unlimited plan).

    // Wallet balance
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('balance_euros, currency')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: "No AI Video wallet found. Please purchase credits first.", code: "NO_WALLET", needsPurchase: true }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currencySymbol = wallet.currency === 'USD' ? '$' : '€';
    if (wallet.balance_euros < totalCost) {
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${currencySymbol}${totalCost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS", needsPurchase: true,
          required: totalCost, available: wallet.balance_euros, currency: wallet.currency
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create generation record
    const resolution = gate.resolutionLabel ?? requestedResolution;
    const { data: generation, error: genError } = await supabaseAdmin
      .from('ai_video_generations')
      .insert({
        user_id: user.id,
        prompt,
        model,
        duration_seconds: duration,
        aspect_ratio: aspectRatio,
        resolution,
        cost_per_second: costPerSecond,
        total_cost_euros: totalCost,
        status: 'pending',
        source_image_url: startImageUrl || null,
      })
      .select()
      .single();

    if (genError) throw genError;

    // Deduct credits
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      { p_user_id: user.id, p_amount: totalCost, p_generation_id: generation.id }
    );

    if (deductError || newBalance === null || newBalance === undefined) {
      console.error('[generate-ltx-video] Deduct credits error:', deductError);
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      throw new Error("Failed to deduct credits");
    }

    console.log(`[generate-ltx-video] Credits deducted. New balance: ${currencySymbol}${newBalance.toFixed(2)}`);

    // Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');
    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/replicate-webhook`);

    const replicateModel = REPLICATE_MODELS[model];
    // Gate-approved values only — no snapping, no fallback rewriting.
    const ratio = aspectRatio;
    const ltxResolution = (gate.resolutionLabel ?? requestedResolution).toLowerCase();

    const replicateInput: Record<string, any> = {
      prompt,
      duration,
      aspect_ratio: ratio,
      resolution: ltxResolution,
      generate_audio: generateAudio !== false,
    };

    if (isImageToVideo) {
      replicateInput.image = startImageUrl;
      if (body.endImageUrl) replicateInput.last_frame_image = body.endImageUrl;
    }
    if (body.cameraMotion) replicateInput.camera_motion = body.cameraMotion;

    console.log(`[generate-ltx-video] Using model: ${replicateModel}`);

    try {
      const prediction = await replicate.predictions.create({
        model: replicateModel,
        input: replicateInput,
        webhook: webhookUrl,
        webhook_events_filter: ['start', 'completed']
      });

      console.log(`[generate-ltx-video] ✅ Prediction created: ${prediction.id}`);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          artlist_job_id: prediction.id,
        })
        .eq('id', generation.id);

    } catch (replicateError: any) {
      console.error('[generate-ltx-video] ❌ Replicate Error:', replicateError);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: `Replicate Error: ${replicateError.message || 'Unknown error'}`
        })
        .eq('id', generation.id);

      // Refund
      const { error: refundError } = await supabaseAdmin.rpc('refund_ai_video_credits', {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: generation.id
      });

      if (refundError) {
        console.error('[generate-ltx-video] Refund failed:', refundError);
      } else {
        console.log(`[generate-ltx-video] ✅ ${currencySymbol}${totalCost.toFixed(2)} refunded`);
      }

      if (replicateError?.response?.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Credits refunded. Please wait and try again.", code: "REPLICATE_RATE_LIMIT" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Video generation failed. Credits refunded.", code: "REPLICATE_ERROR" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        generationId: generation.id,
        cost: totalCost,
        currency: wallet.currency,
        newBalance,
        status: 'processing'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("[generate-ltx-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
