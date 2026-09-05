import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { probeRemoteVideo } from "../_shared/mp4-probe.ts";
import {
  isModelUnlocked,
  isTestAllowlisted,
  priceVideoEnhanceRun,
  UnpriceableRunError,
  validateCombination,
  VIDEO_ENHANCE_SPECS,
  type EnhanceConfig,
  type QualityTier,
  type SourceMetadata,
  type VideoResolution,
} from "../_shared/video-enhance-models.ts";
import {
  newCallbackToken,
  setStatus,
  SUBMIT_LEASE_SECONDS,
  backoffMinutes,
  walletOperation,
} from "../_shared/video-enhance-runtime.ts";

/**
 * THE Video Enhance engine. Every surface (AI Video Studio, media library,
 * Motion Studio, Director's Cut, Universal Content Creator) calls this one
 * function — there is no per-surface service.
 *
 * Actions:
 *   estimate — authoritative price preview from server-measured source facts
 *   start    — idempotent run creation, reservation and provider submit
 *   status   — run state for polling
 *   cancel   — records a cancel WISH; money only moves on provider confirmation
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TAG = "[video-enhance]";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const env = (key: string) => Deno.env.get(key) ?? undefined;

interface RequestBody {
  action?: "estimate" | "start" | "status" | "cancel";
  idempotencyKey?: string;
  /** Validation-only switch, honoured for allowlisted test accounts only. */
  testFailPersistOnce?: boolean;
  runId?: string;
  sourceAssetId?: string;
  sourceUrl?: string;
  modelId?: string;
  mode?: string;
  resolution?: VideoResolution;
  fps?: number | null;
  tier?: QualityTier;
}

function parseConfig(body: RequestBody): EnhanceConfig | null {
  if (!body.modelId || !body.mode || !body.resolution || !body.tier) return null;
  return {
    modelId: body.modelId,
    mode: body.mode,
    resolution: body.resolution,
    fps: body.fps === undefined ? null : body.fps,
    tier: body.tier,
  };
}

/**
 * Source facts NEVER come from the request. They come from our own asset row,
 * and are measured at the file when the row does not carry verified values.
 */
async function resolveSource(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  body: RequestBody,
): Promise<{ url: string; assetId: string | null; meta: SourceMetadata } | { error: string; code: string }> {
  let url = "";
  let assetId: string | null = null;
  let sourceModel: string | undefined;

  if (body.sourceAssetId) {
    // Generated clips live in ai_video_generations, rendered ones in video_creations.
    const { data: generated } = await admin
      .from("ai_video_generations")
      .select("id, video_url, model")
      .eq("id", body.sourceAssetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (generated?.video_url) {
      url = generated.video_url;
      assetId = generated.id;
      sourceModel = generated.model ?? undefined;
    } else {
      const { data: rendered } = await admin
        .from("video_creations")
        .select("id, output_url")
        .eq("id", body.sourceAssetId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!rendered?.output_url) return { error: "Source video not found", code: "SOURCE_NOT_FOUND" };
      url = rendered.output_url;
      assetId = rendered.id;
    }
  } else if (body.sourceUrl) {
    url = body.sourceUrl;
  } else {
    return { error: "sourceAssetId or sourceUrl is required", code: "NO_SOURCE" };
  }

  // The provider must still be able to read this URL after queueing, so only
  // durable AdTool storage (or a long-lived signed URL) is accepted.
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!url.startsWith(supabaseUrl)) {
    return { error: "Source must live in AdTool storage", code: "SOURCE_NOT_DURABLE" };
  }

  try {
    const probed = await probeRemoteVideo(url);
    return { url, assetId, meta: { ...probed, sourceModel } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Could not read source video: ${message}`, code: "SOURCE_UNREADABLE" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: { user }, error: authError } = await anon.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = (await req.json()) as RequestBody;
    const action = body.action ?? "start";

    // ---- status ------------------------------------------------------------
    if (action === "status") {
      if (!body.runId) return json({ error: "runId required" }, 400);
      const { data: run } = await admin
        .from("video_enhance_runs")
        .select("*")
        .eq("id", body.runId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!run) return json({ error: "Run not found" }, 404);
      return json({ run });
    }

    // ---- cancel (a wish, never a refund) ------------------------------------
    if (action === "cancel") {
      if (!body.runId) return json({ error: "runId required" }, 400);
      const { data: run } = await admin
        .from("video_enhance_runs")
        .select("*")
        .eq("id", body.runId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!run) return json({ error: "Run not found" }, 404);

      await admin
        .from("video_enhance_runs")
        .update({ status: "cancel_requested", cancel_requested_at: new Date().toISOString() })
        .eq("id", run.id)
        .not("status", "in", "(completed,provider_failed,provider_cancelled_confirmed)");

      const apiKey = Deno.env.get("REPLICATE_API_KEY");
      if (run.provider_prediction_id && apiKey) {
        await fetch(
          `https://api.replicate.com/v1/predictions/${run.provider_prediction_id}/cancel`,
          { method: "POST", headers: { Authorization: `Bearer ${apiKey}` } },
        ).catch((e) => console.warn(`${TAG} cancel request failed:`, e));
      }
      return json({ ok: true, status: "cancel_requested", refunded: false });
    }

    const config = parseConfig(body);
    if (!config) return json({ error: "modelId, mode, resolution and tier are required" }, 400);

    const spec = VIDEO_ENHANCE_SPECS[config.modelId];
    if (!spec) return json({ error: "Unknown model", code: "UNKNOWN_MODEL" }, 400);

    const source = await resolveSource(admin, user.id, body);
    if ("error" in source) return json({ error: source.error, code: source.code }, 400);

    const combination = validateCombination(config, source.meta.durationSeconds, env);
    if (!combination.ok) {
      return json({ error: `Invalid combination: ${combination.error}`, code: combination.error }, 400);
    }

    let pricing;
    try {
      pricing = priceVideoEnhanceRun(config, source.meta);
    } catch (error) {
      if (error instanceof UnpriceableRunError) {
        return json({ error: error.message, code: "UNPRICEABLE" }, 400);
      }
      throw error;
    }

    if (action === "estimate") {
      return json({ pricing, source: source.meta });
    }

    // ---- start --------------------------------------------------------------
    if (!isModelUnlocked(spec, env, user.id)) {
      return json(
        { error: `${config.modelId} is not unlocked yet.`, code: "MODEL_LOCKED" },
        403,
      );
    }
    if (!body.idempotencyKey) return json({ error: "idempotencyKey required" }, 400);

    const { data: wallet } = await admin
      .from("ai_video_wallets")
      .select("balance_euros, currency")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!wallet) {
      return json({ error: "No credits wallet found", code: "NO_WALLET", needsPurchase: true }, 402);
    }
    if (Number(wallet.balance_euros) < pricing.userPriceEur) {
      return json(
        {
          error: "Insufficient credits",
          code: "INSUFFICIENT_CREDITS",
          needsPurchase: true,
          required: pricing.userPriceEur,
          available: Number(wallet.balance_euros),
        },
        402,
      );
    }

    // Idempotency BEFORE reservation and before the provider is touched.
    const callbackToken = newCallbackToken();
    const insertPayload = {
      user_id: user.id,
      idempotency_key: body.idempotencyKey,
      model_id: config.modelId,
      mode: config.mode,
      resolution: config.resolution,
      fps: pricing.fps,
      tier: config.tier,
      source_asset_id: source.assetId,
      source_url: source.url,
      source_duration_seconds: source.meta.durationSeconds,
      source_width: source.meta.width,
      source_height: source.meta.height,
      source_fps: source.meta.fps,
      source_container: source.meta.container ?? null,
      source_size_bytes: source.meta.sizeBytes ?? null,
      source_model: source.meta.sourceModel ?? null,
      currency: wallet.currency || "EUR",
      pricing_version: pricing.pricingVersion,
      provider_pricing_version: pricing.providerPricingVersion,
      rate_card_version: pricing.rateCardVersion,
      provider_cost_usd_estimated: pricing.providerCostUsdEstimated,
      provider_cost_eur_buffered: pricing.providerCostEurBuffered,
      fx_rate_used: pricing.fxRateUsed,
      fx_safety_buffer_used: pricing.fxSafetyBufferUsed,
      multiplier_used: pricing.multiplierUsed,
      user_price_eur: pricing.userPriceEur,
      net_revenue_eur: pricing.netRevenueEur,
      contribution_eur: pricing.contributionEur,
      margin_pct: pricing.marginPct,
      credits_reserved: pricing.userPriceEur,
      callback_token: callbackToken,
      // Validation-only, allowlisted accounts only: fail persistence exactly
      // once after a real provider success, then succeed on the retry.
      test_fail_persist_once:
        body.testFailPersistOnce === true && isTestAllowlisted(env, user.id),
      status: "created",
    };

    const { data: created, error: insertError } = await admin
      .from("video_enhance_runs")
      .insert(insertPayload)
      .select("*")
      .maybeSingle();

    let run = created;
    if (insertError) {
      if (String(insertError.code) !== "23505") {
        console.error(`${TAG} insert failed:`, insertError.message);
        return json({ error: insertError.message, code: "RUN_CREATE_FAILED" }, 500);
      }
      // Same key again (double click, network retry, parallel call): return the
      // existing run. No second reservation, no second provider job.
      const { data: existing } = await admin
        .from("video_enhance_runs")
        .select("*")
        .eq("user_id", user.id)
        .eq("idempotency_key", body.idempotencyKey)
        .maybeSingle();
      if (!existing) return json({ error: "Run conflict", code: "RUN_CONFLICT" }, 409);
      return json({ run: existing, deduplicated: true, pricing });
    }

    const reservation = await walletOperation(admin, {
      runId: run.id,
      userId: user.id,
      operation: "reserve",
      amountEur: pricing.userPriceEur,
      note: "video enhance reservation",
    });
    if (!reservation.applied && reservation.reason === "wallet_error") {
      await setStatus(admin, run.id, "provider_failed", {
        error_code: "RESERVATION_FAILED",
        error_message: reservation.error ?? "wallet error",
      });
      return json({ error: "Could not reserve credits", code: "RESERVATION_FAILED" }, 402);
    }
    await setStatus(admin, run.id, "credits_reserved");

    // Submit lease: while it is held no other worker submits blindly again.
    const leaseOwner = crypto.randomUUID();
    const leaseExpiry = new Date(Date.now() + SUBMIT_LEASE_SECONDS * 1000).toISOString();
    const { data: leased } = await admin
      .from("video_enhance_runs")
      .update({
        status: "provider_submitting",
        submit_lease_owner: leaseOwner,
        submit_lease_expires_at: leaseExpiry,
      })
      .eq("id", run.id)
      .in("status", ["credits_reserved", "created"])
      .select("id")
      .maybeSingle();
    if (!leased) {
      const { data: current } = await admin
        .from("video_enhance_runs").select("*").eq("id", run.id).maybeSingle();
      return json({ run: current, deduplicated: true, pricing });
    }

    const apiKey = Deno.env.get("REPLICATE_API_KEY");
    if (!apiKey) return json({ error: "REPLICATE_API_KEY not configured" }, 500);

    const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // The token identifies the run; a plain run id in the query string would
    // not be covered by the provider signature.
    const webhookUrl = `${projectUrl}/functions/v1/video-enhance-webhook?callback=${callbackToken}`;
    const input = spec.buildInput(config, source.meta, source.url);

    console.log(
      `${TAG} submit user=${user.id} run=${run.id} model=${spec.id} ${config.resolution}/${pricing.fps}fps price=${pricing.userPriceEur}`,
    );

    let predictionId: string | null = null;
    let providerStatus = "starting";
    try {
      const res = await fetch(
        `https://api.replicate.com/v1/models/${spec.providerModelId}/predictions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            input,
            webhook: webhookUrl,
            webhook_events_filter: ["completed"],
          }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof payload?.detail === "string" ? payload.detail : `provider ${res.status}`;
        console.error(`${TAG} provider rejected run ${run.id}: ${message}`);
        await walletOperation(admin, {
          runId: run.id,
          userId: user.id,
          operation: "release",
          amountEur: pricing.userPriceEur,
          note: "provider rejected submit",
        });
        await setStatus(admin, run.id, "provider_failed", {
          error_code: "PROVIDER_REJECTED",
          error_message: message,
          submit_lease_owner: null,
        });
        return json({ error: message, code: "PROVIDER_REJECTED", status: res.status }, 502);
      }
      predictionId = payload?.id ?? null;
      providerStatus = payload?.status ?? providerStatus;
    } catch (error) {
      // Network failure with an unknown provider outcome: keep the money
      // reserved, keep the run open — the webhook (via the callback token) or
      // the reconciler decides. Never refund on a local uncertainty.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${TAG} submit uncertain for run ${run.id}: ${message}`);
      await setStatus(admin, run.id, "provider_submitted", {
        error_code: "SUBMIT_UNCERTAIN",
        error_message: message,
        provider_submitted_at: new Date().toISOString(),
        next_reconcile_at: new Date(Date.now() + backoffMinutes(1) * 60_000).toISOString(),
      });
      const { data: current } = await admin
        .from("video_enhance_runs").select("*").eq("id", run.id).maybeSingle();
      return json({ run: current, pricing, pending: true });
    }

    await setStatus(admin, run.id, "provider_submitted", {
      provider_prediction_id: predictionId,
      provider_status: providerStatus,
      provider_submitted_at: new Date().toISOString(),
      submit_lease_owner: null,
      submit_lease_expires_at: null,
      next_reconcile_at: new Date(Date.now() + backoffMinutes(1) * 60_000).toISOString(),
    });

    const { data: finalRun } = await admin
      .from("video_enhance_runs").select("*").eq("id", run.id).maybeSingle();

    return json({ run: finalRun, pricing });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${TAG} unhandled:`, message);
    return json({ error: message }, 500);
  }
});
