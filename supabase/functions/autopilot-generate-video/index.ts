// Starts an asynchronous Replicate prediction for an autopilot slot.
// Persists the prediction id and a video_job audit row.
// The poller (autopilot-video-poll) handles completion and credit refund.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface Body {
  slot_id: string;
  visual_prompt_en: string;
}

// Provider → Replicate model + cost per second (in autopilot credits).
// Credits are charged against brief.weekly_credit_budget.
const PROVIDERS: Record<string, { model: string; creditsPerSec: number; ratioMap: Record<string, string> }> = {
  "hailuo-standard": {
    model: "minimax/hailuo-02",
    creditsPerSec: 5,
    ratioMap: { "9:16": "9:16", "1:1": "1:1", "16:9": "16:9" },
  },
  "kling-std": {
    model: "kwaivgi/kling-v2.1",
    creditsPerSec: 8,
    ratioMap: { "9:16": "9:16", "1:1": "1:1", "16:9": "16:9" },
  },
  "seedance-lite": {
    model: "bytedance/seedance-1-lite",
    creditsPerSec: 6,
    ratioMap: { "9:16": "9:16", "1:1": "1:1", "16:9": "16:9" },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { slot_id, visual_prompt_en } = (await req.json()) as Body;
    if (!slot_id || !visual_prompt_en) return json({ ok: false, error: "missing params" }, 400);

    const replicateKey = Deno.env.get("REPLICATE_API_KEY");
    if (!replicateKey) throw new Error("REPLICATE_API_KEY missing");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: slot } = await admin.from("autopilot_queue").select("*").eq("id", slot_id).maybeSingle();
    if (!slot) return json({ ok: false, error: "slot not found" }, 404);

    const { data: brief } = await admin.from("autopilot_briefs").select("*").eq("id", slot.brief_id).maybeSingle();
    if (!brief) throw new Error("brief missing");
    if (!brief.video_enabled) return json({ ok: false, error: "video not enabled in brief" }, 400);

    const providerKey = brief.video_provider as string;
    const provider = PROVIDERS[providerKey] ?? PROVIDERS["hailuo-standard"];
    const duration = Math.min(Math.max(brief.video_duration_sec ?? 6, 4), 12);
    const aspect = brief.video_aspect_ratio ?? "9:16";

    // Cost (charged against weekly budget; refunded on failure by poller)
    const cost = Math.round(provider.creditsPerSec * duration);
    if (brief.weekly_credits_spent + cost > brief.weekly_credit_budget) {
      await admin.from("autopilot_queue").update({
        status: "blocked",
        block_reason: "weekly_budget_exhausted",
      }).eq("id", slot_id);
      return json({ ok: false, error: "budget_exhausted" }, 402);
    }

    // Create prediction (async — webhook would be ideal, we poll instead)
    const input: Record<string, unknown> = {
      prompt: visual_prompt_en,
      duration,
      aspect_ratio: provider.ratioMap[aspect] ?? "9:16",
    };

    const predResp = await fetch("https://api.replicate.com/v1/models/" + provider.model + "/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateKey}`,
        "Content-Type": "application/json",
        Prefer: "respond-async",
      },
      body: JSON.stringify({ input }),
    });

    if (!predResp.ok) {
      const errText = await predResp.text();
      console.error("[autopilot-generate-video] Replicate error", predResp.status, errText);
      await admin.from("autopilot_queue").update({
        status: "failed",
        video_status: "failed",
        video_error: `replicate_${predResp.status}`,
      }).eq("id", slot_id);
      return json({ ok: false, error: "replicate_error", details: errText.slice(0, 500) }, 502);
    }

    const pred = await predResp.json();
    const predictionId = pred?.id as string;

    // Reserve credits on the brief immediately
    await admin.from("autopilot_briefs").update({
      weekly_credits_spent: brief.weekly_credits_spent + cost,
    }).eq("id", brief.id);

    // Mark slot as generating_video
    await admin.from("autopilot_queue").update({
      status: "generating_video",
      video_provider: providerKey,
      video_prediction_id: predictionId,
      video_status: "processing",
      video_started_at: new Date().toISOString(),
      generation_cost_credits: (slot.generation_cost_credits ?? 0) + cost,
    }).eq("id", slot_id);

    // Audit row
    await admin.from("autopilot_video_jobs").insert({
      user_id: slot.user_id,
      slot_id: slot.id,
      provider: providerKey,
      model: provider.model,
      prompt: visual_prompt_en,
      duration_sec: duration,
      aspect_ratio: aspect,
      prediction_id: predictionId,
      status: "processing",
      cost_credits: cost,
      started_at: new Date().toISOString(),
    });

    await admin.from("autopilot_activity_log").insert({
      user_id: slot.user_id,
      event_type: "video_started",
      actor: "ai",
      slot_id: slot.id,
      payload: { provider: providerKey, prediction_id: predictionId, cost },
    });

    return json({ ok: true, prediction_id: predictionId, cost });
  } catch (e) {
    console.error("autopilot-generate-video error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
