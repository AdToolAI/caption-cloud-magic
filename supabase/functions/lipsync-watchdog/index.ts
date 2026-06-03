/**
 * lipsync-watchdog — server-side single source of truth for stale lip-sync runs.
 *
 * Runs every 2 min via pg_cron. Finds composer_scenes where:
 *   • lip_sync_status = 'running' AND
 *   • lip_sync_applied_at IS NULL AND
 *   • updated_at older than the per-phase TTL AND
 *   • no provider job has progressed in that window
 *
 * For each match: calls the shared `failLipSync()` helper → cancels open
 * Sync.so jobs, refunds credits idempotently, sets the scene terminal `failed`.
 *
 * Replaces the previous client-side stale-reset code that caused the loop.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { failLipSync } from "../_shared/lipsync-fail.ts";
import { getSyncApiKey } from "../_shared/syncso-preflight.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TTLs (ms): a `running` scene with no measurable progress beyond this is dead.
const STALE_PROVIDER_MS = 10 * 60_000;   // Sync.so jobs in flight w/o update
const STALE_PREFLIGHT_MS = 4 * 60_000;   // running but never produced a provider job
const STALE_HARD_MS = 20 * 60_000;       // safety cap regardless of state

interface SceneRow {
  id: string;
  project_id: string;
  lip_sync_status: string | null;
  lip_sync_applied_at: string | null;
  twoshot_stage: string | null;
  replicate_prediction_id: string | null;
  dialog_shots: any;
  audio_plan: any;
  updated_at: string;
}

function hasRecordedProviderJobLocal(d: SceneRow): boolean {
  if (typeof d.replicate_prediction_id === "string" && d.replicate_prediction_id.startsWith("sync:")) {
    return true;
  }
  const ds = d.dialog_shots ?? {};
  const shots = Array.isArray(ds.shots) ? ds.shots : [];
  if (shots.some((s: any) => s?.sync_job_id)) return true;
  const passes = Array.isArray(ds.passes) ? ds.passes : [];
  if (passes.some((p: any) => p?.job_id)) return true;
  if (ds?.sync_job_id) return true;
  const plan = d.audio_plan ?? {};
  if (plan?.twoshot?.heartbeat?.syncJobId) return true;
  const jobs = plan?.twoshot?.syncJobs?.jobs;
  if (Array.isArray(jobs) && jobs.length > 0) return true;
  return false;
}

/**
 * Fallback check: per-turn dispatches store the Sync.so job id only in
 * `syncso_dispatch_log`, never on the shot row (compose-dialog-scene v23
 * pre-redirect behavior). Without this query the watchdog mis-classifies
 * scenes that DO have provider jobs in flight as `watchdog_preflight_aborted`
 * (4 min TTL) instead of `watchdog_provider_timeout` (10 min TTL).
 */
async function hasRecordedProviderJob(
  supabase: any,
  d: SceneRow,
): Promise<boolean> {
  if (hasRecordedProviderJobLocal(d)) return true;
  try {
    const { count } = await supabase
      .from("syncso_dispatch_log")
      .select("id", { count: "exact", head: true })
      .eq("scene_id", d.id)
      .gte(
        "created_at",
        new Date(new Date(d.updated_at).getTime() - 5 * 60_000).toISOString(),
      );
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

async function userIdForProject(supabase: any, projectId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", projectId)
      .maybeSingle();
    return (data as any)?.user_id ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const syncApiKey = getSyncApiKey() || null;

  const cutoff = new Date(Date.now() - STALE_PREFLIGHT_MS).toISOString();
  const { data: rows, error } = await supabase
    .from("composer_scenes")
    .select(
      "id, project_id, lip_sync_status, lip_sync_applied_at, twoshot_stage, replicate_prediction_id, dialog_shots, audio_plan, updated_at",
    )
    .eq("lip_sync_status", "running")
    .is("lip_sync_applied_at", null)
    .lt("updated_at", cutoff)
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const failed: Array<{ scene_id: string; reason: string }> = [];

  for (const d of (rows ?? []) as SceneRow[]) {
    const ageMs = now - new Date(d.updated_at).getTime();
    const hasJob = await hasRecordedProviderJob(supabase, d);

    let reason: string | null = null;
    if (ageMs > STALE_HARD_MS) {
      reason = "watchdog_hard_timeout";
    } else if (!hasJob && ageMs > STALE_PREFLIGHT_MS) {
      reason = "watchdog_preflight_aborted";
    } else if (hasJob && ageMs > STALE_PROVIDER_MS) {
      reason = "watchdog_provider_timeout";
    }
    if (!reason) continue;

    const uid = await userIdForProject(supabase, d.project_id);
    const refundCredits = Number(d.dialog_shots?.cost_credits) || 0;
    await failLipSync({
      supabase,
      sceneId: d.id,
      userId: uid,
      reason,
      refundCredits,
      syncApiKey,
    });
    failed.push({ scene_id: d.id, reason });
  }

  console.log(`[lipsync-watchdog] scanned=${rows?.length ?? 0} failed=${failed.length}`);
  return new Response(JSON.stringify({ ok: true, scanned: rows?.length ?? 0, failed }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
