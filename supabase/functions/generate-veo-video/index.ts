import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Pricing in EUR/USD per second (≥70% Marge gegenüber Replicate)
const MODEL_PRICING: Record<string, Record<string, number>> = {
  'veo-3.1-lite-720p': { EUR: 0.20, USD: 0.20 },
  'veo-3.1-lite-1080p': { EUR: 0.30, USD: 0.30 },
  'veo-3.1-fast': { EUR: 0.55, USD: 0.55 },
  'veo-3.1-pro': { EUR: 1.40, USD: 1.40 },
};

const REPLICATE_MODELS: Record<string, string> = {
  'veo-3.1-lite-720p': 'google/veo-3.1-fast',
  'veo-3.1-lite-1080p': 'google/veo-3.1-fast',
  'veo-3.1-fast': 'google/veo-3.1-fast',
  'veo-3.1-pro': 'google/veo-3.1',
};

const MODEL_RESOLUTION: Record<string, '720p' | '1080p'> = {
  'veo-3.1-lite-720p': '720p',
  'veo-3.1-lite-1080p': '1080p',
  'veo-3.1-fast': '1080p',
  'veo-3.1-pro': '1080p',
};

type VeoModelId = 'veo-3.1-lite-720p' | 'veo-3.1-lite-1080p' | 'veo-3.1-fast' | 'veo-3.1-pro';

interface GenerateRequest {
  prompt: string;
  model: VeoModelId;
  duration: number;
  aspectRatio: '16:9' | '9:16';
  startImageUrl?: string;
  generateAudio?: boolean;
  negativePrompt?: string;
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as GenerateRequest;
    const { prompt, model, duration: rawDuration, aspectRatio, startImageUrl, generateAudio = true, negativePrompt } = body;

    if (!prompt || !prompt.trim()) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!MODEL_PRICING[model]) {
      return new Response(
        JSON.stringify({ error: "Invalid model" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Veo 3.1 supports 4, 6 or 8 seconds
    const allowed = [4, 6, 8];
    const duration = allowed.includes(rawDuration) ? rawDuration : 4;

    const isImageToVideo = !!startImageUrl;
    const mode = isImageToVideo ? 'Image-to-Video' : 'Text-to-Video';
    console.log(`[generate-veo-video] Mode: ${mode}, Duration: ${duration}s, Audio: ${generateAudio}`);

    // Wallet currency
    const { data: walletPreview } = await supabaseAdmin
      .from('ai_video_wallets')
      .select('currency')
      .eq('user_id', user.id)
      .single();

    const currency = walletPreview?.currency || 'EUR';

    // Cost
    const modelPricing = MODEL_PRICING[model];
    const costPerSecond = modelPricing[currency] || modelPricing['EUR'];
    const totalCost = duration * costPerSecond;

    // Rate limit (max 10 videos / hour across all providers)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('ai_video_generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      // [legacy] Per-user video rate limit removed (single unlimited plan).

    // Check wallet
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

    console.log(`[generate-veo-video] Cost: ${currencySymbol}${totalCost.toFixed(2)}, Balance: ${currencySymbol}${wallet.balance_euros.toFixed(2)}`);

    // Generation row
    const resolution = MODEL_RESOLUTION[model] || '720p';
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

    // Deduct
    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      'deduct_ai_video_credits',
      { p_user_id: user.id, p_amount: totalCost, p_generation_id: generation.id }
    );

    if (deductError || newBalance === null || newBalance === undefined) {
      console.error('[generate-veo-video] Deduct error:', deductError);
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      throw new Error("Failed to deduct credits");
    }

    console.log(`[generate-veo-video] Credits deducted. New balance: ${currencySymbol}${newBalance.toFixed(2)}`);

    // Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = `${SUPABASE_URL}/functions/v1/replicate-webhook`;

    const replicateModel = REPLICATE_MODELS[model];

    const replicateInput: Record<string, any> = {
      prompt,
      duration,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    };

    // Lite-Varianten: explizite Auflösung an Replicate übergeben (nur bei veo-3.1-fast Model)
    if (model === 'veo-3.1-lite-720p' || model === 'veo-3.1-lite-1080p') {
      replicateInput.resolution = MODEL_RESOLUTION[model];
    }

    if (negativePrompt && negativePrompt.trim()) {
      replicateInput.negative_prompt = negativePrompt.trim();
    }

    if (isImageToVideo) {
      replicateInput.image = startImageUrl;
    }

    console.log(`[generate-veo-video] Using model: ${replicateModel}`);
    console.log(`[generate-veo-video] Input:`, JSON.stringify({
      ...replicateInput,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
    }));

    try {
      const prediction = await replicate.predictions.create({
        model: replicateModel,
        input: replicateInput,
        webhook: webhookUrl,
        webhook_events_filter: ['start', 'completed']
      });

      console.log(`[generate-veo-video] ✅ Prediction created: ${prediction.id}`);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          artlist_job_id: prediction.id,
        })
        .eq('id', generation.id);

    } catch (replicateError: any) {
      console.error('[generate-veo-video] ❌ Replicate Error:', replicateError);

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
        console.error('[generate-veo-video] Refund failed:', refundError);
      } else {
        console.log(`[generate-veo-video] ✅ ${currencySymbol}${totalCost.toFixed(2)} refunded`);
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
    console.error("[generate-veo-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
