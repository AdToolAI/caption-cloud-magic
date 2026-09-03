import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
import { trackAIGeneration, trackBusinessEvent } from "../_shared/telemetry.ts";
import { resolveCostPerSecond } from "../_shared/videoPricingCatalog.ts";
import { resolveAccountCostPerSecond } from "../_shared/accountVideoPricing.ts";
import {
  createSeedance25Task,
  getModelArkTask,
  storeModelArkVideo,
  MODELARK_JOB_PREFIX,
} from "../_shared/modelark.ts";
import {
  checkImageDimensions,
  describeImageViolation,
  describeProviderImageError,
  imageRequirementsFor,
  probeRemoteImageSize,
  type ImageLocale,
} from "../_shared/videoImageRequirements.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const MODEL_ID = "seedance-2-5";
const MIN_DURATION = 4;
const MAX_DURATION = 30;

interface GenerateRequest {
  prompt: string;
  model?: string;
  /** 4–30 s, or -1 for the provider's smart duration. */
  duration: number;
  aspectRatio?: string;
  /** ModelArk supports 480p and 720p output for Seedance 2.5 — 1080p is rejected. */
  resolution?: "480p" | "720p";
  startImageUrl?: string;
  endImageUrl?: string;
  referenceImageUrls?: string[];
  /** Reference clips (role `reference_video`, max 10). */
  referenceVideoUrls?: string[];
  /** Single reference clip sent by the shared v2v UI. */
  referenceVideoUrl?: string;
  /** Reference audio clips (role `reference_audio`, max 10). */
  referenceAudioUrls?: string[];
  /** Native audio generation (`generate_audio`). */
  generateAudio?: boolean;
  /**
   * Explicit ambience-only mode for studio pipelines that add speech later.
   * AI Video Studio normally leaves this false because Seedance 2.5 can
   * generate prompt-controlled native dialogue together with its audio.
   */
  suppressDialogue?: boolean;
  seed?: number;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json() as GenerateRequest;
    const {
      prompt,
      duration,
      aspectRatio = "16:9",
      resolution = "720p",
      startImageUrl,
      endImageUrl,
      referenceImageUrls,
      referenceVideoUrls,
      referenceVideoUrl,
      referenceAudioUrls,
      generateAudio = false,
      suppressDialogue = false,
      seed,
    } = body;

    const refVideos = [
      ...(referenceVideoUrls ?? []),
      ...(referenceVideoUrl ? [referenceVideoUrl] : []),
    ].filter(Boolean).slice(0, 10);
    const refAudios = (referenceAudioUrls ?? []).filter(Boolean).slice(0, 10);

    // Ambience-only: sound yes, speech no. Same wording as the composer's
    // hybrid-ambient path so both routes condition the model identically.
    const NO_SPEECH_CLAUSE =
      "[AUDIO] Ambient sound design only: room tone, foley, natural environment " +
      "and optional instrumental music. No spoken words, no dialogue, no narration, " +
      "no singing. Characters do not talk and their lips stay closed.";
    const effectivePrompt =
      generateAudio && suppressDialogue
        ? `${String(prompt).trim()}\n\n${NO_SPEECH_CLAUSE}`
        : prompt;

    if (!prompt || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // `-1` = provider smart duration: billed at the maximum length up front and
    // corrected down once ModelArk reports the real clip length.
    const smartDuration = duration === -1;
    if (
      !smartDuration &&
      (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION)
    ) {
      return new Response(
        JSON.stringify({
          error: `Duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds for Seedance 2.5`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const billedDuration = smartDuration ? MAX_DURATION : duration;

    /**
     * Image pre-check — runs BEFORE any credit deduction or provider call.
     * ModelArk rejects images below 300 px width or outside the 1:2.5–2.5:1
     * ratio band with a raw 400; we catch that here with a readable message
     * and without charging the user.
     */
    const locale = ((req.headers.get("x-locale") ?? "en").slice(0, 2)) as ImageLocale;
    const requirements = imageRequirementsFor(MODEL_ID, "seedance");
    const imagesToCheck = [
      startImageUrl,
      endImageUrl,
      ...((referenceImageUrls ?? []) as string[]),
    ].filter(Boolean) as string[];

    for (const url of imagesToCheck) {
      const dims = await probeRemoteImageSize(url);
      if (!dims) continue; // unknown format → let the provider decide
      const check = checkImageDimensions(dims, requirements);
      if (!check.ok) {
        console.warn("[generate-seedance25-video] image rejected pre-flight", {
          url, dims, violation: check.violation,
        });
        return new Response(
          JSON.stringify({
            error: describeImageViolation(check, locale, "Seedance 2.5"),
            code: "IMAGE_REQUIREMENTS_NOT_MET",
            violation: check.violation,
            width: dims.width,
            height: dims.height,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }




    const { data: walletPreview } = await supabaseClient
      .from("ai_video_wallets")
      .select("currency")
      .eq("user_id", user.id)
      .single();

    const currency = (walletPreview?.currency || "EUR") as "EUR" | "USD";
    // 480p and 720p are billed on separate catalog tiers (20.08.2026 re-pricing):
    // 720p = 11.95 EUR / 30 s, 480p = 6.95 EUR / 30 s.
    const pricingModelId = resolution === "480p" ? `${MODEL_ID}-480p` : MODEL_ID;
    const costPerSecond = await resolveAccountCostPerSecond(
      supabaseAdmin, user.id, pricingModelId, currency, 0.3983,
    );
    const totalCost = +(billedDuration * costPerSecond).toFixed(4);

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("balance_euros, currency")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({
          error: "No AI Video wallet found. Please purchase credits first.",
          code: "NO_WALLET",
          needsPurchase: true,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const currencySymbol = wallet.currency === "USD" ? "$" : "€";
    if (wallet.balance_euros < totalCost) {
      await trackBusinessEvent("credit_insufficient", user.id, {
        provider: "seedance25",
        model: MODEL_ID,
        required: totalCost,
        available: wallet.balance_euros,
        currency: wallet.currency,
      }).catch(() => {});
      return new Response(
        JSON.stringify({
          error: `Insufficient credits. Need ${currencySymbol}${totalCost.toFixed(2)}, have ${currencySymbol}${wallet.balance_euros.toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS",
          needsPurchase: true,
          required: totalCost,
          available: wallet.balance_euros,
          currency: wallet.currency,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: generation, error: genError } = await supabaseAdmin
      .from("ai_video_generations")
      .insert({
        user_id: user.id,
        prompt,
        model: MODEL_ID,
        duration_seconds: billedDuration,
        aspect_ratio: aspectRatio,
        resolution,
        cost_per_second: costPerSecond,
        total_cost_euros: totalCost,
        status: "pending",
        source_image_url: startImageUrl || null,
      })
      .select()
      .single();

    if (genError) throw genError;

    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc(
      "deduct_ai_video_credits",
      { p_user_id: user.id, p_amount: totalCost, p_generation_id: generation.id },
    );

    if (deductError || newBalance === null || newBalance === undefined) {
      console.error("[generate-seedance25-video] Deduct credits error:", deductError);
      await supabaseAdmin
        .from("ai_video_generations")
        .update({ status: "failed", error_message: "Failed to deduct credits" })
        .eq("id", generation.id);
      throw new Error("Failed to deduct credits");
    }

    const refund = async (reason: string) => {
      await supabaseAdmin
        .from("ai_video_generations")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: reason.slice(0, 500),
        })
        .eq("id", generation.id);
      const { error: refundError } = await supabaseAdmin.rpc("refund_ai_video_credits", {
        p_user_id: user.id,
        p_amount_euros: totalCost,
        p_generation_id: generation.id,
      });
      if (refundError) console.error("[generate-seedance25-video] Refund failed:", refundError);
    };

    /**
     * Smart duration (-1) is billed at the 30 s maximum up front. Once the
     * provider reports the real clip length, the unused seconds go straight
     * back to the wallet.
     */
    const settleSmartDuration = async (actualSeconds?: number) => {
      if (!smartDuration || !actualSeconds || actualSeconds >= billedDuration) return;
      const actualCost = +(Math.max(MIN_DURATION, actualSeconds) * costPerSecond).toFixed(4);
      const delta = +(totalCost - actualCost).toFixed(4);
      if (delta <= 0.001) return;
      const { error: refundError } = await supabaseAdmin.rpc("refund_ai_video_credits", {
        p_user_id: user.id,
        p_amount_euros: delta,
        p_generation_id: generation.id,
      });
      if (refundError) {
        console.error("[generate-seedance25-video] Smart-duration refund failed:", refundError);
        return;
      }
      await supabaseAdmin
        .from("ai_video_generations")
        .update({ duration_seconds: actualSeconds, total_cost_euros: actualCost })
        .eq("id", generation.id);
    };

    let taskId: string;
    try {
      taskId = await createSeedance25Task({
        prompt: effectivePrompt,
        duration: smartDuration ? -1 : duration,
        resolution,
        aspectRatio,
        firstFrameUrl: startImageUrl,
        lastFrameUrl: endImageUrl,
        referenceImageUrls,
        referenceVideoUrls: refVideos,
        referenceAudioUrls: refAudios,
        generateAudio,
        seed,
      });

    } catch (providerError: any) {
      console.error("[generate-seedance25-video] ModelArk error:", providerError);
      await refund(`ModelArk Error: ${providerError?.message ?? "Unknown error"}`);
      return new Response(
        JSON.stringify({
          error: "Video generation failed. Credits refunded.",
          code: "MODELARK_ERROR",
          detail: String(providerError?.message ?? "").slice(0, 300),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabaseAdmin
      .from("ai_video_generations")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        artlist_job_id: `${MODELARK_JOB_PREFIX}${taskId}`,
      })
      .eq("id", generation.id);

    await trackAIGeneration("started", user.id, {
      provider: "modelark",
      model: MODEL_ID,
      duration_s: billedDuration,
      cost_eur: totalCost,
      aspect_ratio: aspectRatio,
      resolution,
      generation_id: generation.id,
    }).catch(() => {});

    // Background poll — ModelArk has no webhook. `modelark-poll` acts as the
    // safety net when this background task is cut short.
    const pollInBackground = async () => {
      const deadline = Date.now() + 12 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 8000));
        try {
          const task = await getModelArkTask(taskId);
          if (task.status === "succeeded" && task.videoUrl) {
            const permanentUrl = await storeModelArkVideo(
              supabaseAdmin,
              "ai-videos",
              `${user.id}/${generation.id}.mp4`,
              task.videoUrl,
            );
            await supabaseAdmin
              .from("ai_video_generations")
              .update({
                status: "completed",
                video_url: permanentUrl,
                completed_at: new Date().toISOString(),
                error_message: null,
              })
              .eq("id", generation.id);
            await settleSmartDuration(task.durationSeconds);

            await trackAIGeneration("completed", user.id, {
              provider: "modelark",
              model: MODEL_ID,
              cost_eur: totalCost,
              generation_id: generation.id,
            }).catch(() => {});
            return;
          }
          if (task.status === "failed" || task.status === "cancelled") {
            await refund(task.error ?? "ModelArk task failed");
            return;
          }
        } catch (err) {
          console.error("[generate-seedance25-video] poll error:", err);
        }
      }
      console.warn(`[generate-seedance25-video] Poll deadline hit for task ${taskId}`);
    };

    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(pollInBackground());
    } else {
      void pollInBackground();
    }

    return new Response(
      JSON.stringify({
        success: true,
        generationId: generation.id,
        taskId,
        cost: totalCost,
        currency: wallet.currency,
        newBalance,
        status: "processing",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("[generate-seedance25-video] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
