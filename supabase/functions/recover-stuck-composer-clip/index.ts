/**
 * recover-stuck-composer-clip — v149
 *
 * Recovery worker for composer master-plate clips that are stuck on
 * `clip_status='generating'` because the Replicate webhook never fired
 * (Hailuo/HappyHorse/Kling occasionally drop completion callbacks).
 *
 * Invoked by `qa-watchdog` every ~2 min for scenes older than 10 min, or
 * manually by admins with a list of `scene_ids`.
 *
 * Per scene:
 *  1. Load row (id, project_id, replicate_prediction_id, clip_status,
 *     duration_seconds, clip_source, clip_quality, updated_at, clip_error,
 *     engine_override).
 *  2. If no prediction_id    → fail + refund.
 *  3. GET Replicate prediction.
 *     - succeeded → replay `compose-clip-webhook` with the Replicate payload
 *                   (the webhook is idempotent and handles Cinematic-Sync
 *                   auto-lipsync handoff).
 *     - failed/canceled → mark failed + refund (idempotent via
 *                          `clip_error LIKE 'watchdog_%'` guard).
 *     - processing/starting → only kill if age > 30 min; otherwise just log.
 *
 * Refunds use the same `refund_ai_video_credits` RPC + CLIP_COSTS table as
 * `compose-clip-webhook` so credits stay in lockstep.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { CLIP_COSTS } from "../_shared/clip-costs.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY")!;

const HARD_KILL_AGE_MS = 30 * 60 * 1000; // 30 min

type Outcome =
  | "webhook_replayed"
  | "clip_failed_refunded"
  | "still_processing"
  | "hard_killed_refunded"
  | "no_prediction_refunded"
  | "skipped_no_replicate_key"
  | "skipped_already_resolved"
  | "error";

interface Result {
  scene_id: string;
  outcome: Outcome;
  detail?: string;
}

async function refundScene(
  sb: ReturnType<typeof createClient>,
  scene: any,
): Promise<number | null> {
  const { data: project } = await sb
    .from("composer_projects")
    .select("user_id")
    .eq("id", scene.project_id)
    .single();
  if (!project) return null;

  const tier: "standard" | "pro" =
    scene.clip_quality === "pro" ? "pro" : "standard";
  const costPerSec = CLIP_COSTS[scene.clip_source]?.[tier] ?? 0.15;
  const refundAmount =
    Number(scene.duration_seconds ?? 0) * costPerSec;

  if (refundAmount <= 0) return 0;

  try {
    await sb.rpc("refund_ai_video_credits", {
      p_user_id: (project as any).user_id,
      p_amount_euros: refundAmount,
      p_generation_id: scene.id,
    });
    return refundAmount;
  } catch (err) {
    console.error(
      `[recover-stuck-composer-clip] refund failed scene=${scene.id}`,
      err,
    );
    return null;
  }
}

async function markFailed(
  sb: ReturnType<typeof createClient>,
  sceneId: string,
  reason: string,
  isCinematicSync: boolean,
) {
  await sb
    .from("composer_scenes")
    .update({
      clip_status: "failed",
      clip_error: reason.slice(0, 500),
      ...(isCinematicSync
        ? {
            lip_sync_status: null,
            twoshot_stage: null,
            lip_sync_source_clip_url: null,
            dialog_shots: null,
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId);
}

async function replayWebhook(
  prediction: any,
  sceneId: string,
  projectId: string,
): Promise<boolean> {
  const webhookBase = appendWebhookToken(
    `${SUPABASE_URL}/functions/v1/compose-clip-webhook`,
  );
  const url = `${webhookBase}&scene_id=${encodeURIComponent(sceneId)}&project_id=${encodeURIComponent(projectId)}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prediction),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error(
        `[recover-stuck-composer-clip] webhook replay failed scene=${sceneId} status=${r.status} body=${txt.slice(0, 300)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[recover-stuck-composer-clip] webhook replay threw scene=${sceneId}`,
      err,
    );
    return false;
  }
}

async function processScene(
  sb: ReturnType<typeof createClient>,
  sceneId: string,
): Promise<Result> {
  const { data: scene, error } = await sb
    .from("composer_scenes")
    .select(
      "id, project_id, replicate_prediction_id, clip_status, clip_url, duration_seconds, clip_source, clip_quality, updated_at, clip_error, engine_override",
    )
    .eq("id", sceneId)
    .maybeSingle();

  if (error || !scene) {
    return { scene_id: sceneId, outcome: "error", detail: "scene_not_found" };
  }

  // Skip if already resolved by another worker / user action.
  if (
    (scene as any).clip_status !== "generating" ||
    (scene as any).clip_url
  ) {
    return { scene_id: sceneId, outcome: "skipped_already_resolved" };
  }

  const isCinematicSync =
    String((scene as any).engine_override ?? "") === "cinematic-sync";
  const alreadyRefunded = String(
    (scene as any).clip_error ?? "",
  ).startsWith("watchdog_");

  const predictionId = String(
    (scene as any).replicate_prediction_id ?? "",
  );

  if (!predictionId) {
    if (!alreadyRefunded) {
      const refunded = await refundScene(sb, scene);
      await markFailed(
        sb,
        sceneId,
        `watchdog_no_prediction_id (refunded €${(refunded ?? 0).toFixed(2)})`,
        isCinematicSync,
      );
    }
    console.log(
      `[recover-stuck-composer-clip] v149_clip_failed_refunded scene=${sceneId} reason=no_prediction_id`,
    );
    return { scene_id: sceneId, outcome: "no_prediction_refunded" };
  }

  // Don't try to poll sync.so or other non-Replicate IDs (e.g. `sync:...`).
  if (predictionId.includes(":")) {
    return {
      scene_id: sceneId,
      outcome: "skipped_already_resolved",
      detail: `non_replicate_prediction_id=${predictionId}`,
    };
  }

  if (!REPLICATE_API_KEY) {
    return { scene_id: sceneId, outcome: "skipped_no_replicate_key" };
  }

  let prediction: any;
  try {
    const r = await fetch(
      `https://api.replicate.com/v1/predictions/${encodeURIComponent(predictionId)}`,
      { headers: { Authorization: `Token ${REPLICATE_API_KEY}` } },
    );
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error(
        `[recover-stuck-composer-clip] replicate GET failed scene=${sceneId} pred=${predictionId} status=${r.status} body=${txt.slice(0, 200)}`,
      );
      // On 404 from Replicate: prediction lost — refund + fail.
      if (r.status === 404 && !alreadyRefunded) {
        const refunded = await refundScene(sb, scene);
        await markFailed(
          sb,
          sceneId,
          `watchdog_prediction_404 (refunded €${(refunded ?? 0).toFixed(2)})`,
          isCinematicSync,
        );
        return { scene_id: sceneId, outcome: "clip_failed_refunded" };
      }
      return {
        scene_id: sceneId,
        outcome: "error",
        detail: `replicate_${r.status}`,
      };
    }
    prediction = await r.json();
  } catch (err) {
    console.error(
      `[recover-stuck-composer-clip] replicate fetch threw scene=${sceneId}`,
      err,
    );
    return { scene_id: sceneId, outcome: "error", detail: "fetch_threw" };
  }

  const status = String(prediction?.status ?? "");
  const ageMs =
    Date.now() - new Date(String((scene as any).updated_at)).getTime();
  const ageMin = Math.round(ageMs / 60_000);

  console.log(
    `[recover-stuck-composer-clip] scene=${sceneId} pred=${predictionId} status=${status} age=${ageMin}min`,
  );

  if (status === "succeeded" && prediction.output) {
    const ok = await replayWebhook(prediction, sceneId, scene.project_id);
    if (ok) {
      console.log(
        `[recover-stuck-composer-clip] v149_webhook_replayed scene=${sceneId} pred=${predictionId}`,
      );
      return { scene_id: sceneId, outcome: "webhook_replayed" };
    }
    return {
      scene_id: sceneId,
      outcome: "error",
      detail: "webhook_replay_failed",
    };
  }

  if (status === "failed" || status === "canceled") {
    if (!alreadyRefunded) {
      const refunded = await refundScene(sb, scene);
      const reason =
        `watchdog_replicate_${status}: ${String(prediction?.error ?? "unknown").slice(0, 200)} (refunded €${(refunded ?? 0).toFixed(2)})`;
      await markFailed(sb, sceneId, reason, isCinematicSync);
    }
    console.log(
      `[recover-stuck-composer-clip] v149_clip_failed_refunded scene=${sceneId} pred=${predictionId} status=${status}`,
    );
    return { scene_id: sceneId, outcome: "clip_failed_refunded" };
  }

  // processing / starting / queued
  if (ageMs > HARD_KILL_AGE_MS) {
    if (!alreadyRefunded) {
      const refunded = await refundScene(sb, scene);
      await markFailed(
        sb,
        sceneId,
        `watchdog_hard_kill_after_${ageMin}min (status=${status}, refunded €${(refunded ?? 0).toFixed(2)})`,
        isCinematicSync,
      );
    }
    console.log(
      `[recover-stuck-composer-clip] v149_clip_hard_killed scene=${sceneId} pred=${predictionId} age=${ageMin}min`,
    );
    return { scene_id: sceneId, outcome: "hard_killed_refunded" };
  }

  console.log(
    `[recover-stuck-composer-clip] v149_clip_still_processing scene=${sceneId} age=${ageMin}min — leaving alone`,
  );
  return { scene_id: sceneId, outcome: "still_processing" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "recover-stuck-composer-clip" });


  try {
    const body = await req.json().catch(() => ({}));
    const sceneIds: string[] = Array.isArray(body?.scene_ids)
      ? body.scene_ids.filter((x: unknown) => typeof x === "string")
      : [];

    if (sceneIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "scene_ids[] required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Process sequentially to avoid hammering Replicate / wallet RPC.
    const results: Result[] = [];
    for (const id of sceneIds.slice(0, 50)) {
      try {
        results.push(await processScene(sb, id));
      } catch (err) {
        console.error(
          `[recover-stuck-composer-clip] processScene threw scene=${id}`,
          err,
        );
        results.push({ scene_id: id, outcome: "error", detail: "threw" });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, count: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[recover-stuck-composer-clip] fatal", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "unknown",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
