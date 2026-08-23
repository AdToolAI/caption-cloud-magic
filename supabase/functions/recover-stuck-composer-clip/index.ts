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
 * Refunds (FA-4/P1-A) go exclusively through `composer_refund_charge`: only a
 * DB-proven, run-scoped `deduction` is refunded, at most once per charge.
 * No proof → 0 €; the scene is terminalized either way.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { refundRunCharge } from "./refund-provenance.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { logMissingReinjectPointer } from "../_shared/v431-ledger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
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

/**
 * FA-4/P1-A — refunds only against a DB-proven, run-scoped charge.
 * Returns the refunded amount, or null when nothing was refunded.
 */
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

  const runId = (scene as any).active_run_id as string | null;
  if (!runId) {
    console.log(
      `[recover-stuck-composer-clip] p1a_no_active_run scene=${scene.id} → no_charge`,
    );
    return null;
  }

  const result = await refundRunCharge(
    sb as unknown as Parameters<typeof refundRunCharge>[0],
    (project as any).user_id,
    runId,
    "watchdog_stuck_clip",
  );

  console.log(
    `[recover-stuck-composer-clip] p1a_refund scene=${scene.id} run=${runId} outcome=${result.outcome} amount=${result.amount_euros}`,
  );

  return result.outcome === "refunded" ? result.amount_euros : null;
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
      pipeline_state: "failed",
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
  pipelineJobId: string | null,
): Promise<boolean> {
  const webhookBase = appendWebhookToken(
    `${SUPABASE_URL}/functions/v1/compose-clip-webhook`,
  );
  // v431 G3.1f — Re-Injection ohne Transport-Pointer ist ein Vertragsfehler.
  if (!pipelineJobId) {
    logMissingReinjectPointer({
      function: "recover-stuck-composer-clip",
      sceneId,
      stage: "base_video",
      externalJobId: String(prediction?.id ?? ""),
    });
    return false;
  }
  const url = `${webhookBase}&scene_id=${encodeURIComponent(sceneId)}&project_id=${encodeURIComponent(projectId)}&pipeline_job_id=${encodeURIComponent(pipelineJobId)}`;
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

/**
 * v455 — Kandidaten-Tupel aus dem Watchdog. Wird unmittelbar vor jeder
 * Mutation gegen den aktuellen DB-Stand geprüft, damit ein alter Watchdog-Lauf
 * niemals einen neueren Run/Job terminalisiert.
 */
interface Candidate {
  scene_id: string;
  run_id?: string | null;
  plate_generation?: number | null;
  pipeline_job_id?: string | null;
  external_job_id?: string | null;
}

export interface LedgerJobRow {
  id: string;
  stage: string;
  status: string;
  external_job_id: string | null;
  run_id: string | null;
  plate_generation: number | null;
  updated_at: string | null;
}

const JOB_COLS =
  "id, stage, status, external_job_id, run_id, plate_generation, updated_at, completed_at";

/**
 * v455 (A) — Zeitautorität: der aktive Base-Video-Ledger-Job. Kandidaten-Job
 * hat Vorrang; für Legacy-/Manual-Aufrufe wird der aktuelle dispatchte
 * Base-Video-Job der Szene aufgelöst. `composer_scenes.updated_at` ist nur
 * noch Fallback, wenn KEIN Ledger-Job existiert.
 */
export async function resolveAuthoritativeJob(
  sb: ReturnType<typeof createClient>,
  sceneId: string,
  candidate: Candidate | undefined,
): Promise<LedgerJobRow | null> {
  if (candidate?.pipeline_job_id) {
    const { data } = await sb
      .from("composer_pipeline_jobs")
      .select(JOB_COLS)
      .eq("id", candidate.pipeline_job_id)
      .maybeSingle();
    return (data as unknown as LedgerJobRow) ?? null;
  }
  const { data } = await sb
    .from("composer_pipeline_jobs")
    .select(JOB_COLS)
    .eq("scene_id", sceneId)
    .eq("stage", "base_video")
    .eq("status", "dispatched")
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  return (row as unknown as LedgerJobRow) ?? null;
}

/** v455 (A) — Alter kommt aus dem Ledger-Job, sobald einer existiert. */
export function authoritativeAgeMs(
  job: { updated_at?: string | null } | null,
  scene: { updated_at?: string | null },
  now = Date.now(),
): { ageMs: number; source: "pipeline_job" | "scene" } {
  const stamp = job?.updated_at ?? null;
  if (stamp) return { ageMs: now - new Date(String(stamp)).getTime(), source: "pipeline_job" };
  return {
    ageMs: now - new Date(String(scene.updated_at ?? new Date(0).toISOString())).getTime(),
    source: "scene",
  };
}

/** v455 (D) — vollständige Tupel-Validierung gegen Szene UND Ledger-Job. */
async function candidateStillCurrent(
  sb: ReturnType<typeof createClient>,
  scene: any,
  candidate: Candidate | undefined,
  job: LedgerJobRow | null,
): Promise<boolean> {
  if (!candidate) return true;
  if (candidate.run_id && String(scene.active_run_id ?? "") !== String(candidate.run_id)) {
    return false;
  }
  if (
    candidate.plate_generation != null &&
    Number(scene.plate_generation ?? -1) !== Number(candidate.plate_generation)
  ) {
    return false;
  }
  if (
    candidate.external_job_id &&
    String(scene.replicate_prediction_id ?? "") !== String(candidate.external_job_id)
  ) {
    return false;
  }
  if (candidate.pipeline_job_id) {
    if (!job) return false;
    if (String(job.stage) !== "base_video") return false;
    if (String(job.status) !== "dispatched") return false;
    if (candidate.run_id && String(job.run_id ?? "") !== String(candidate.run_id)) return false;
    if (
      candidate.plate_generation != null &&
      Number(job.plate_generation ?? -1) !== Number(candidate.plate_generation)
    ) {
      return false;
    }
    if (
      candidate.external_job_id &&
      String(job.external_job_id ?? "") !== String(candidate.external_job_id)
    ) {
      return false;
    }
    // Ledger und Szene müssen auf dieselbe Provider-Prediction zeigen.
    if (
      job.external_job_id &&
      String(scene.replicate_prediction_id ?? "") !== String(job.external_job_id)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * v455 (C) — Fallback-Terminalisierung: markiert AUSSCHLIESSLICH den validierten
 * Base-Video-Job terminal (idempotent, gefenced auf run/gen/prediction/stage).
 * Kein Provider-Dispatch, kein Eingriff in Run/Gen/Prediction-Felder.
 */
export async function terminalizeLedgerJobDirect(
  sb: ReturnType<typeof createClient>,
  job: LedgerJobRow | null,
  errorCode: string,
): Promise<"terminalized" | "already_terminal" | "no_job"> {
  if (!job?.id) return "no_job";
  if (String(job.status) !== "dispatched") {
    if (!job.completed_at) {
      await sb
        .from("composer_pipeline_jobs")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", job.id)
        .is("completed_at", null);
    }
    return "already_terminal";
  }
  await sb
    .from("composer_pipeline_jobs")
    .update({
      status: "failed",
      error_code: errorCode,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("stage", "base_video")
    .eq("status", "dispatched");
  return "terminalized";
}


async function processScene(
  sb: ReturnType<typeof createClient>,
  sceneId: string,
  candidate?: Candidate,
): Promise<Result> {
  const { data: scene, error } = await sb
    .from("composer_scenes")
    .select(
      "id, project_id, active_run_id, plate_generation, replicate_prediction_id, plate_pipeline_job_id, clip_status, clip_url, duration_seconds, clip_source, clip_quality, updated_at, clip_error, engine_override",
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

  // v455 — Race-Guard: Szene ist inzwischen auf einen neueren Run/Job/
  // Prediction gewechselt → dieser Kandidat ist veraltet, kein No-Op-Schaden.
  if (!(await candidateStillCurrent(sb, scene, candidate))) {
    console.log(
      `[recover-stuck-composer-clip] v455_stale_candidate_discarded scene=${sceneId} run=${candidate?.run_id ?? "null"} job=${candidate?.pipeline_job_id ?? "null"}`,
    );
    return {
      scene_id: sceneId,
      outcome: "skipped_already_resolved",
      detail: "v455_stale_candidate_discarded",
    };
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
        `watchdog_no_prediction_id ${refunded === null ? "(no refund: no proven charge)" : `(refunded €${refunded.toFixed(2)})`}`,
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
          `watchdog_prediction_404 ${refunded === null ? "(no refund: no proven charge)" : `(refunded €${refunded.toFixed(2)})`}`,
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
    const ok = await replayWebhook(
      prediction,
      sceneId,
      scene.project_id,
      ((scene as any).plate_pipeline_job_id as string | null) ?? null,
    );
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
        `watchdog_replicate_${status}: ${String(prediction?.error ?? "unknown").slice(0, 200)} ${refunded === null ? "(no refund: no proven charge)" : `(refunded €${refunded.toFixed(2)})`}`;
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
        `watchdog_hard_kill_after_${ageMin}min (status=${status}, ${refunded === null ? "no refund: no proven charge" : `refunded €${refunded.toFixed(2)}`})`,
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
    // v455 — optionale Tupel-Kandidaten (scene/run/gen/job/external).
    const candidateByScene = new Map<string, Candidate>();
    if (Array.isArray(body?.candidates)) {
      for (const c of body.candidates) {
        if (c && typeof c.scene_id === "string") candidateByScene.set(c.scene_id, c as Candidate);
      }
    }

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
        results.push(await processScene(sb, id, candidateByScene.get(id)));
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
