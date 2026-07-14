import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { trackAIGeneration, trackBusinessEvent } from "../_shared/telemetry.ts";
import { resolveCostPerSecond, VIDEO_PRICING_CATALOG } from "../_shared/videoPricingCatalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Replicate model slug + per-model capabilities. Prices come from the shared
// pricing catalog (single source of truth) — do NOT duplicate them here.
type KlingModelId =
  | 'kling-3'
  | 'kling-3-standard' // legacy alias → kling-3
  | 'kling-3-pro'      // legacy alias → kling-3
  | 'kling-2.5-turbo'
  | 'kling-2.6'
  | 'kling-omni';

const KLING_MODEL_CONFIG: Record<KlingModelId, {
  slug: string;
  mode?: 'standard' | 'pro';
  supportsNativeAudio: boolean;
  supportsNativeLipSync: boolean;
  resolution: '720p' | '1080p';
}> = {
  'kling-3':          { slug: 'kwaivgi/kling-v3-video',                          supportsNativeAudio: true,  supportsNativeLipSync: false, resolution: '1080p' },
  // Legacy aliases resolve to the unified v3 slug (Replicate consolidated 3.0).
  'kling-3-standard': { slug: 'kwaivgi/kling-v3-video',                          supportsNativeAudio: true,  supportsNativeLipSync: false, resolution: '1080p' },
  'kling-3-pro':      { slug: 'kwaivgi/kling-v3-video',                          supportsNativeAudio: true,  supportsNativeLipSync: false, resolution: '1080p' },
  'kling-2.5-turbo':  { slug: 'kwaivgi/kling-v2.5-turbo-pro',                    supportsNativeAudio: false, supportsNativeLipSync: false, resolution: '1080p' },
  'kling-2.6':        { slug: 'kwaivgi/kling-v2.6',                              supportsNativeAudio: true,  supportsNativeLipSync: false, resolution: '1080p' },
  'kling-omni':       { slug: 'kwaivgi/kling-v3-omni-video',                     supportsNativeAudio: true,  supportsNativeLipSync: true,  resolution: '1080p' },
};

interface GenerateRequest {
  prompt: string;
  model: KlingModelId;
  duration: number; // 3-15 seconds
  aspectRatio: '16:9' | '9:16' | '1:1';
  generateAudio?: boolean;
  /** Omni only: spoken dialogue text (used as native lip-sync source). */
  dialogText?: string;
  /** Omni only: TTS voice preset / gender hint. */
  voicePreset?: string;
  /** Omni only: per-speaker voice mapping (max 2). Used when a scene contains
   *  multiple named speakers in the dialogue transcript. */
  speakerVoices?: Array<{ name: string; voice: string }>;
  // Image-to-Video
  startImageUrl?: string;
  endImageUrl?: string;
  // Video-to-Video
  referenceVideoUrl?: string;
  videoReferenceType?: 'feature' | 'base';
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

    // Authenticate
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json() as GenerateRequest & { spokenLanguage?: string; suppressDialogue?: boolean };
    const { prompt, model, duration, aspectRatio, generateAudio, dialogText, voicePreset, speakerVoices, startImageUrl, endImageUrl, referenceVideoUrl, videoReferenceType } = body;
    const spokenLanguage = typeof body.spokenLanguage === 'string' ? body.spokenLanguage : undefined;
    const suppressDialogue = body.suppressDialogue === true;

    // Resolve model config (with safe fallback to Standard)
    const modelConfig = KLING_MODEL_CONFIG[model] ?? KLING_MODEL_CONFIG['kling-3'];

    if (generateAudio && spokenLanguage) {
      console.log(`[generate-kling-video] model=${model} spokenLanguage=${spokenLanguage}`);
    }
    if (generateAudio && suppressDialogue) {
      console.log(`[generate-kling-video] model=${model} suppressDialogue=true — ambient-only fallback`);
    }

    // Validate duration against catalog (per-model maxDuration).
    const catalogEntry = VIDEO_PRICING_CATALOG[model];
    const minDur = catalogEntry?.minDuration ?? 3;
    const maxDur = catalogEntry?.maxDuration ?? 15;
    if (duration < minDur || duration > maxDur) {
      return new Response(
        JSON.stringify({ error: `Duration must be between ${minDur} and ${maxDur} seconds for ${model}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine generation mode
    const isImageToVideo = !!startImageUrl;
    const isVideoToVideo = !!referenceVideoUrl;
    const mode = isVideoToVideo ? 'Video-to-Video' : isImageToVideo ? 'Image-to-Video' : 'Text-to-Video';
    console.log(`[generate-kling-video] Mode: ${mode}`);

    // Get wallet currency
    const { data: walletPreview } = await supabaseClient
      .from('ai_video_wallets')
      .select('currency')
      .eq('user_id', user.id)
      .single();

    const currency = walletPreview?.currency || 'EUR';

    // Canonical price from shared pricing catalog — single source of truth.
    const costPerSecond = resolveCostPerSecond(model, currency as 'EUR' | 'USD') ?? 0.18;
    const totalCost = +(duration * costPerSecond).toFixed(4);
      // [legacy] Per-user video rate limit removed (single unlimited plan).

    // Check wallet balance
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
      await trackBusinessEvent('credit_insufficient', user.id, {
        provider: 'kling', model, required: totalCost,
        available: wallet.balance_euros, currency: wallet.currency,
      }).catch(() => {});
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${currencySymbol}${totalCost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS", needsPurchase: true,
          required: totalCost, available: wallet.balance_euros, currency: wallet.currency
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-kling-video] Cost: ${currencySymbol}${totalCost.toFixed(2)}, Balance: ${currencySymbol}${wallet.balance_euros.toFixed(2)}`);

    // Create generation record
    const resolution = modelConfig.resolution;
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
      console.error('[generate-kling-video] Deduct credits error:', deductError);
      await supabaseAdmin
        .from('ai_video_generations')
        .update({ status: 'failed', error_message: 'Failed to deduct credits' })
        .eq('id', generation.id);
      throw new Error("Failed to deduct credits");
    }

    console.log(`[generate-kling-video] Credits deducted. New balance: ${currencySymbol}${newBalance.toFixed(2)}`);

    // Initialize Replicate
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Webhook URL
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const webhookUrl = appendWebhookToken(`${SUPABASE_URL}/functions/v1/replicate-webhook`);

    // Build Kling input (model-driven — Omni gets native audio + lip-sync fields)
    const replicateInput: Record<string, any> = {
      prompt,
      duration: duration,
      aspect_ratio: aspectRatio,
    };
    if (modelConfig.mode) {
      replicateInput.mode = modelConfig.mode;
    }

    // Kling expects language as the full English name, not a 2-letter code.
    const LANG_MAP: Record<string, string> = { de: 'german', en: 'english', es: 'spanish' };
    const klingLang = spokenLanguage
      ? (LANG_MAP[spokenLanguage.toLowerCase()] ?? spokenLanguage)
      : undefined;

    // Native audio (Kling 2.6 / Omni). Ambient-only fallback disables TTS.
    if (modelConfig.supportsNativeAudio && generateAudio && !suppressDialogue) {
      replicateInput.generate_audio = true;
      if (klingLang) replicateInput.spoken_language = klingLang;
    }

    // Native lip-sync (Omni only): if we have dialog text, hand it to Kling
    // and skip the downstream Sync.so pipeline entirely.
    if (modelConfig.supportsNativeLipSync && dialogText && dialogText.trim().length > 0 && !suppressDialogue) {
      replicateInput.dialog = dialogText.trim();
      if (voicePreset) replicateInput.voice = voicePreset;
      if (Array.isArray(speakerVoices) && speakerVoices.length > 0) {
        replicateInput.speaker_voices = speakerVoices
          .slice(0, 2)
          .map((s) => ({ name: String(s.name || '').slice(0, 40), voice: String(s.voice || 'neutral') }));
      }
      if (klingLang) replicateInput.spoken_language = klingLang;
      console.log(`[generate-kling-video] Native lip-sync enabled (Omni, lang=${klingLang ?? 'auto'}, chars=${dialogText.length}, speakers=${speakerVoices?.length ?? 1})`);
    }

    // Image-to-Video
    if (startImageUrl) {
      replicateInput.start_image = startImageUrl;
    }
    if (endImageUrl) {
      replicateInput.end_image = endImageUrl;
    }

    // Video-to-Video
    if (referenceVideoUrl) {
      replicateInput.reference_video = referenceVideoUrl;
      replicateInput.video_reference_type = videoReferenceType || 'feature';
    }

    console.log(`[generate-kling-video] Replicate slug=${modelConfig.slug} input:`, JSON.stringify({
      ...replicateInput,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      dialog: replicateInput.dialog ? `${String(replicateInput.dialog).substring(0, 60)}…` : undefined,
    }));

    try {
      const prediction = await replicate.predictions.create({
        model: modelConfig.slug,
        input: replicateInput,
        webhook: webhookUrl,
        webhook_events_filter: ['start', 'completed']
      });

      console.log(`[generate-kling-video] ✅ Prediction created: ${prediction.id}`);

      await supabaseAdmin
        .from('ai_video_generations')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          artlist_job_id: prediction.id,
        })
        .eq('id', generation.id);

      await trackAIGeneration('started', user.id, {
        provider: 'kling', model, duration_s: duration,
        cost_eur: totalCost, aspect_ratio: aspectRatio, resolution,
        generation_id: generation.id,
      }).catch(() => {});

    } catch (replicateError: any) {
      console.error('[generate-kling-video] ❌ Replicate Error:', replicateError);

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
        console.error('[generate-kling-video] Refund failed:', refundError);
      } else {
        console.log(`[generate-kling-video] ✅ ${currencySymbol}${totalCost.toFixed(2)} refunded`);
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
    console.error("[generate-kling-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
