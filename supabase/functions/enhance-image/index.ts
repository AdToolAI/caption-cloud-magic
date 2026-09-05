import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
import {
  ENHANCE_MODEL_SPECS,
  isModelUnlocked,
  priceSnapshotForRun,
  type EnhanceModelId,
  type EnhanceRunInput,
} from "../_shared/picture-enhance-models.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface EnhanceRequest extends EnhanceRunInput {
  modelId: EnhanceModelId;
  imageId?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "image" });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = (await req.json()) as EnhanceRequest;
    const spec = ENHANCE_MODEL_SPECS[body.modelId];
    if (!spec) return json({ error: "Unknown model", code: "UNKNOWN_MODEL" }, 400);
    if (!body.imageUrl?.trim()) return json({ error: "imageUrl is required" }, 400);

    if (!isModelUnlocked(spec, (key) => Deno.env.get(key) ?? undefined, user.id)) {
      return json(
        {
          error: `${body.modelId} is not unlocked yet. Cost and quality tests are still running.`,
          code: "MODEL_LOCKED",
        },
        403,
      );
    }

    const scale = spec.supportedScales ? (body.scale ?? spec.supportedScales[0]) : undefined;
    if (spec.supportedScales && !spec.supportedScales.includes(scale as number)) {
      return json({ error: `Unsupported scale ${scale}`, code: "UNSUPPORTED_SCALE" }, 400);
    }

    const runInput: EnhanceRunInput = {
      imageUrl: body.imageUrl.trim(),
      scale,
      values: body.values ?? {},
      inputWidth: body.inputWidth,
      inputHeight: body.inputHeight,
    };

    // ---- wallet check (charge only AFTER a persisted result) -----------------
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("ai_video_wallets")
      .select("balance_euros, currency")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      return json(
        { error: "No AI Credits wallet found. Please purchase credits first.", code: "NO_WALLET", needsPurchase: true },
        402,
      );
    }

    const currency = wallet.currency || "EUR";
    const symbol = currency === "USD" ? "$" : "€";
    // Authoritative price — a price sent by the browser is never used.
    const pricing = priceSnapshotForRun(spec, runInput);
    const cost = pricing.userPriceEur;

    if (wallet.balance_euros < cost) {
      return json(
        {
          error: `Insufficient credits. Need ${symbol}${cost.toFixed(2)}, have ${symbol}${Number(wallet.balance_euros).toFixed(2)}`,
          code: "INSUFFICIENT_CREDITS",
          needsPurchase: true,
          required: cost,
          available: wallet.balance_euros,
          currency,
        },
        402,
      );
    }

    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_API_KEY) return json({ error: "REPLICATE_API_KEY not configured" }, 500);

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });
    const input = spec.buildInput(runInput);
    const outputFormat = String(input.output_format ?? "png");

    console.log(
      `[enhance-image] user=${user.id} model=${spec.id} scale=${scale ?? "-"} cost=${symbol}${cost.toFixed(2)} mode=${pricing.pricingMode} margin=${(pricing.marginPct * 100).toFixed(1)}%`,
      JSON.stringify({ ...input, image: "<url>" }),
    );

    let output: unknown;
    try {
      output = await replicate.run(spec.providerModelId as never, { input });
    } catch (providerError) {
      const message = providerError instanceof Error ? providerError.message : String(providerError);
      console.error("[enhance-image] provider failed:", message);
      // No charge happened — nothing to refund.
      return json({ error: `Enhance failed: ${message}`, code: "PROVIDER_FAILED" }, 502);
    }

    let outputUrl: string | null = null;
    if (typeof output === "string") outputUrl = output;
    else if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string") outputUrl = output[0];
    else if (output && typeof output === "object" && "url" in (output as Record<string, unknown>)) {
      const raw = (output as { url: unknown }).url;
      outputUrl = typeof raw === "function" ? String((raw as () => unknown).call(output)) : String(raw);
    }
    if (!outputUrl) return json({ error: "No image returned", code: "NO_OUTPUT" }, 502);

    // ---- persistence (retried; only a lost result aborts the run) ------------
    const imageRes = await fetch(outputUrl);
    if (!imageRes.ok) return json({ error: "Failed to fetch enhanced image", code: "PROVIDER_FETCH_FAILED" }, 502);
    const buffer = await imageRes.arrayBuffer();
    const ext = outputFormat === "jpg" ? "jpg" : outputFormat === "webp" ? "webp" : "png";
    const contentType = ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    const storagePath = `${user.id}/picture-studio/${spec.id}-${Date.now()}.${ext}`;

    let uploadError: { message: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await supabaseAdmin.storage
        .from("background-projects")
        .upload(storagePath, buffer, { contentType, upsert: attempt > 1 });
      uploadError = error ? { message: error.message } : null;
      if (!uploadError) break;
      console.warn(`[enhance-image] upload attempt ${attempt} failed: ${uploadError.message}`);
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
    if (uploadError) {
      return json({ error: `Storage error: ${uploadError.message}`, code: "PERSIST_FAILED", providerUrl: outputUrl }, 500);
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from("background-projects").getPublicUrl(storagePath);
    const publicUrl = publicUrlData.publicUrl;

    let parentMeta: { prompt?: string; style?: string; aspect_ratio?: string; album_id?: string | null } = {};
    if (body.imageId) {
      const { data: parent } = await supabaseAdmin
        .from("studio_images")
        .select("prompt, style, aspect_ratio, album_id")
        .eq("id", body.imageId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (parent) parentMeta = parent;
    }

    // The provider already ran successfully at this point. The media library
    // row is retried; a database hiccup must never turn a paid provider run
    // into a free run, and it must never trigger a second provider call.
    const workflowType = getWorkflowTypeForEnhanceModel(spec.id);
    const persisted = await persistStudioImage(
      supabaseAdmin,
      {
        user_id: user.id,
        image_url: publicUrl,
        workflow_type: workflowType,
        prompt: parentMeta.prompt || `Enhanced with ${spec.id}`,
        style: parentMeta.style || "realistic",
        model_used: spec.id,
        aspect_ratio: parentMeta.aspect_ratio || "1:1",
        source: "generated",
        album_id: parentMeta.album_id || null,
        parent_id: body.imageId || null,
        upscale_factor: scale ?? null,
        metadata_json: { storagePath, enhanceModel: input.enhance_model ?? null, scale: scale ?? null },
      },
      "[enhance-image]",
    );

    const { data: newBalance, error: deductError } = await supabaseAdmin.rpc("deduct_ai_video_credits", {
      p_user_id: user.id,
      p_amount: cost,
      p_generation_id: persisted.id,
    });
    if (deductError) console.error("[enhance-image] deduct error:", deductError.message);

    // Freeze the pricing inputs so this run stays explainable after rate,
    // FX or curve changes.
    const { data: runRow, error: snapshotError } = await supabaseAdmin
      .from("picture_enhance_runs")
      .insert({
        user_id: user.id,
        model_id: spec.id,
        studio_image_id: persisted.id,
        scale: scale ?? null,
        currency,
        pricing_mode: pricing.pricingMode,
        pricing_version: pricing.pricingVersion,
        provider_pricing_version: pricing.providerPricingVersion,
        provider_cost_usd_estimated: pricing.providerCostUsdEstimated,
        provider_cost_eur_buffered: pricing.providerCostEurBuffered,
        fx_rate_used: pricing.fxRateUsed,
        fx_safety_buffer_used: pricing.fxSafetyBufferUsed,
        multiplier_used: pricing.multiplierUsed,
        user_price_eur: pricing.userPriceEur,
        net_revenue_eur: pricing.netRevenueEur,
        contribution_eur: pricing.contributionEur,
        margin_pct: pricing.marginPct,
        status: persisted.ok ? "completed" : "asset_persist_failed",
      })
      .select("id")
      .maybeSingle();
    if (snapshotError) console.warn("[enhance-image] pricing snapshot warning:", snapshotError.message);

    if (persisted.id && runRow?.id) {
      const { error: linkError } = await supabaseAdmin
        .from("studio_images")
        .update({ source_run_id: runRow.id })
        .eq("id", persisted.id);
      if (linkError) console.warn("[enhance-image] run link warning:", linkError.message);
    }

    if (!persisted.ok) {
      console.error("[enhance-image] studio_images insert exhausted:", persisted.error);
      return json(
        {
          error:
            "Your enhanced image is ready and safely stored, but it could not be added to your library yet. We are retrying — the result is not lost.",
          code: "ASSET_PERSIST_FAILED",
          providerUrl: publicUrl,
          cost,
          currency,
        },
        500,
      );
    }

    return json({
      success: true,
      image: {
        id: persisted.id,
        url: publicUrl,
        previewUrl: publicUrl,
        modelId: spec.id,
        scale: scale ?? null,
        parentId: body.imageId || null,
        enhanceModel: input.enhance_model ?? null,
        workflowType,
      },
      cost,
      pricing,
      currency,
      newBalance: newBalance ?? Number(wallet.balance_euros) - cost,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[enhance-image] unhandled error:", message);
    return json({ error: message }, 500);
  }
});
