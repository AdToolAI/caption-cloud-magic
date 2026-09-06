// ============================================================================
// modelark-poll — completion driver for BytePlus ModelArk (Seedance 2.5)
// ----------------------------------------------------------------------------
// ModelArk has no webhook. This function polls all in-flight ModelArk tasks and
// finalizes them:
//   • AI Video Studio  → `ai_video_generations` (store video, refund on fail)
//   • Video Composer   → posts a Replicate-shaped payload to
//     `compose-clip-webhook`, so all existing downstream logic (media library,
//     lip-sync handoff, refunds, project progress) is reused unchanged.
//
// Safe to call repeatedly (idempotent) — from the client, from
// compose-video-clips, or from a cron job.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import {
  getModelArkTask,
  storeModelArkVideo,
  extractModelArkTaskId,
  MODELARK_JOB_PREFIX,
  MODELARK_BASE_URL,
  modelArkApiKey,
} from "../_shared/modelark.ts";
import { heartbeatPipelineJob } from "../_shared/v427-callback-guard.ts";
import { logMissingReinjectPointer } from "../_shared/v431-ledger.ts";
import { recordGenerationOutput } from "../_shared/videoOutputMeasurement.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

/** Hard timeout for a single ModelArk task. */
const TASK_TIMEOUT_MS = 25 * 60 * 1000;

async function scan(sceneFilterId: string | null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const summary = { generations: 0, scenes: 0, completed: 0, failed: 0, pending: 0 };

  {
    /* ── 1. AI Video Studio generations ─────────────────────────────── */
    const { data: generations } = await supabase
      .from("ai_video_generations")
      .select("id, user_id, artlist_job_id, started_at, total_cost_euros, model, resolution, aspect_ratio")
      .eq("status", "processing")
      .like("artlist_job_id", `${MODELARK_JOB_PREFIX}%`)
      .limit(50);

    for (const gen of generations ?? []) {
      const taskId = extractModelArkTaskId(gen.artlist_job_id);
      if (!taskId) continue;
      summary.generations++;

      const failGeneration = async (reason: string) => {
        await supabase
          .from("ai_video_generations")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            error_message: reason.slice(0, 500),
          })
          .eq("id", gen.id);
        await supabase.rpc("refund_ai_video_credits", {
          p_user_id: gen.user_id,
          p_amount_euros: gen.total_cost_euros,
          p_generation_id: gen.id,
        });
        summary.failed++;
      };

      try {
        const task = await getModelArkTask(taskId);
        if (task.status === "succeeded" && task.videoUrl) {
          const permanentUrl = await storeModelArkVideo(
            supabase,
            "ai-videos",
            `${gen.user_id}/${gen.id}.mp4`,
            task.videoUrl,
          );
          await supabase
            .from("ai_video_generations")
            .update({
              status: "completed",
              video_url: permanentUrl,
              completed_at: new Date().toISOString(),
              error_message: null,
            })
            .eq("id", gen.id);
          await recordGenerationOutput(supabase, {
            id: gen.id,
            model: gen.model,
            resolution: gen.resolution,
            aspect_ratio: gen.aspect_ratio,
            video_url: permanentUrl,
            parity_model_id: generation.parity_model_id,
            parity_api_route: generation.parity_api_route,
            parity_region: generation.parity_region,
            parity_mode: generation.parity_mode,
            parity_resolution_label: generation.parity_resolution_label,
            requested_width: generation.requested_width,
            requested_height: generation.requested_height,
          });
          summary.completed++;
        } else if (task.status === "failed" || task.status === "cancelled") {
          await failGeneration(task.error ?? "ModelArk task failed");
        } else if (
          gen.started_at && Date.now() - new Date(gen.started_at).getTime() > TASK_TIMEOUT_MS
        ) {
          await failGeneration("ModelArk task timed out");
        } else {
          summary.pending++;
        }
      } catch (err) {
        console.error(`[modelark-poll] generation ${gen.id}:`, err);
        summary.pending++;
      }
    }

    /* ── 2. Video Composer scenes ───────────────────────────────────── */
    let sceneQuery = supabase
      .from("composer_scenes")
      .select("id, project_id, replicate_prediction_id, plate_pipeline_job_id, active_run_id, plate_generation, updated_at")
      // v430 Step 5D: read the modern state column only; `pipeline_state` is
      // NOT NULL and always maintained by the bridge trigger. No legacy OR.
      .eq("pipeline_state", "plate_rendering")
      .like("replicate_prediction_id", `${MODELARK_JOB_PREFIX}%`)
      .limit(50);
    if (sceneFilterId) sceneQuery = sceneQuery.eq("id", sceneFilterId);

    const { data: scenes } = await sceneQuery;
    const webhookUrl = appendWebhookToken(`${supabaseUrl}/functions/v1/compose-clip-webhook`);

    for (const scene of scenes ?? []) {
      const taskId = extractModelArkTaskId(scene.replicate_prediction_id);
      if (!taskId) continue;
      summary.scenes++;

      const notifyWebhook = async (payload: Record<string, unknown>) => {
        // v431 G3.1f — ohne Transport-Pointer wird NICHT re-injiziert.
        const pointer = (scene as any).plate_pipeline_job_id as string | null;
        if (!pointer) {
          logMissingReinjectPointer({
            function: "modelark-poll",
            sceneId: scene.id,
            stage: "base_video",
            externalJobId: taskId,
            runId: scene.active_run_id ?? null,
            generation: scene.plate_generation ?? null,
          });
          return;
        }
        const res = await fetch(
          `${webhookUrl}&scene_id=${scene.id}&project_id=${scene.project_id}&run_id=${encodeURIComponent(scene.active_run_id ?? "")}&generation=${scene.plate_generation ?? 0}&pipeline_job_id=${encodeURIComponent(pointer)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: taskId, ...payload }),
          },
        );
        if (!res.ok) {
          console.error(
            `[modelark-poll] webhook for scene ${scene.id} failed: ${res.status}`,
          );
        }
      };

      try {
        const task = await getModelArkTask(taskId);
        if (task.status === "succeeded" && task.videoUrl) {
          await notifyWebhook({ status: "succeeded", output: task.videoUrl });
          summary.completed++;
        } else if (task.status === "failed" || task.status === "cancelled") {
          await notifyWebhook({
            status: "failed",
            error: task.error ?? "ModelArk task failed",
          });
          summary.failed++;
        } else if (
          scene.updated_at &&
          Date.now() - new Date(scene.updated_at).getTime() > TASK_TIMEOUT_MS
        ) {
          await notifyWebhook({ status: "failed", error: "ModelArk task timed out" });
          summary.failed++;
        } else {
          // v427A3: non-consuming heartbeat so provider leases stay alive.
          // Never consumes the completion event, never fails the poll.
          if (scene.active_run_id) {
            await heartbeatPipelineJob(supabase, {
              sceneId: scene.id,
              runId: String(scene.active_run_id),
              stage: "base_video",
              externalJobId: taskId,
            });
          }
          summary.pending++;
        }

      } catch (err) {
        console.error(`[modelark-poll] scene ${scene.id}:`, err);
        summary.pending++;
      }
    }

    return summary;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let sceneFilterId: string | null = null;
  let ping = false;
  try {
    const body = await req.json();
    sceneFilterId = body?.sceneId ?? null;
    ping = body?.ping === true;
  } catch { /* no body */ }

  // Connectivity check: verifies MODELARK_API_KEY + region without spending credits.
  if (ping) {
    try {
      const res = await fetch(`${MODELARK_BASE_URL}/contents/generations/tasks?page_size=1`, {
        headers: { Authorization: `Bearer ${modelArkApiKey()}` },
      });
      const text = await res.text();
      return new Response(
        JSON.stringify({ ok: res.ok, status: res.status, body: text.slice(0, 400) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ ok: false, error: err?.message ?? "ping failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  try {
    const summary = await scan(sceneFilterId);

    // Keep polling in the background until every in-flight task settles.
    if (summary.pending > 0) {
      const keepPolling = async () => {
        const deadline = Date.now() + 20 * 60 * 1000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 10_000));
          try {
            const next = await scan(sceneFilterId);
            if (next.pending === 0) return;
          } catch (err) {
            console.error("[modelark-poll] background scan failed:", err);
          }
        }
      };
      // @ts-ignore EdgeRuntime is provided by the Supabase runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(keepPolling());
      }
    }

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[modelark-poll] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
