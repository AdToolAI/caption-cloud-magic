/**
 * QA Watchdog
 *
 * Runs every 2 minutes via pg_cron. Detects silent worker deaths and
 * production anomalies that the regular monitoring would miss.
 *
 * Checks:
 * 1. Stale qa_live_runs   (running >10min)  → auto-fail + bug report
 * 2. Stale autopilot slots (generating >15min) → auto-fail + bug report
 * 3. Stale lambda renders  (no completion >20min) → bug report
 * 4. Stale two-shot lipsync (running >10min) → auto-fail + refund + bug report
 * 5. Provider-quota outage (>50% failures last 10min) → bug report
 * 6. Stale cron heartbeats (job missed 2× expected interval) → bug report
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { recordHeartbeat } from "../_shared/heartbeat.ts";
import { withSentryCron } from "../_shared/sentryCron.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Auto-cleanup TTLs for composer_scenes zombies.
// A job that never left `pending`/`queued` for 60 min is stuck in dispatch
// (provider concurrency exhausted, orchestrator crash, …) and will not
// recover on its own — cancel it so the user can retry.
const NEVER_DISPATCHED_TTL_MIN = 60;
// Absolute hard ceiling: no active job may live longer than this, regardless
// of status. Catches every exotic state the specialised watchdogs miss.
const HARD_ACTIVE_TTL_HOURS = 6;
// Flat refund per scene killed by the hard-TTL sweep. Mirrors the lipsync
// block's convention (block 4). Never-dispatched scenes get no refund because
// no provider call was ever billed.
const HARD_TTL_REFUND_PER_SCENE = 28;

interface Anomaly {
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  fingerprint: string;
}

async function bugAlreadyExists(sb: any, fingerprint: string): Promise<boolean> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("qa_bug_reports")
    .select("id")
    .eq("title", fingerprint)
    .gte("created_at", since)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

async function fileBug(sb: any, a: Anomaly): Promise<boolean> {
  if (await bugAlreadyExists(sb, a.title)) return false;
  const { error } = await sb.from("qa_bug_reports").insert({
    mission_name: "watchdog",
    severity: a.severity,
    category: a.kind,
    title: a.title,
    description: a.description,
    status: "open",
  });
  if (error) {
    console.error("[watchdog] bug insert failed:", error.message);
    return false;
  }
  return true;
}

Deno.serve(withSentryCron("qa-watchdog", { schedule: "*/2 * * * *", maxRuntime: 5 }, async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const start = Date.now();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const anomalies: Anomaly[] = [];
  let rowsAutoFailed = 0;

  try {
    // ─── 1. Stale qa_live_runs (>10min in non-terminal state) ───
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: staleRuns } = await sb
      .from("qa_live_runs")
      .select("id, provider, status, started_at, sweep_id")
      .in("status", ["pending", "running", "async_started"])
      .lt("started_at", tenMinAgo)
      .limit(50);

    if (staleRuns && staleRuns.length > 0) {
      const ids = staleRuns.map((r: any) => r.id);
      await sb
        .from("qa_live_runs")
        .update({
          status: "failed",
          error_message: "Watchdog auto-fail: stuck >10min",
          completed_at: new Date().toISOString(),
        })
        .in("id", ids);
      rowsAutoFailed += ids.length;

      const providers = [...new Set(staleRuns.map((r: any) => r.provider))].sort();
      anomalies.push({
        kind: "workflow",
        severity: "high",
        title: `Watchdog: ${ids.length} qa_live_runs stuck >10min (${providers.join(", ")})`,
        description: `Auto-failed rows:\n${staleRuns
          .map((r: any) => `- ${r.provider} (id=${r.id}, started ${r.started_at})`)
          .join("\n")}`,
        fingerprint: `live-runs-stale-${providers.join("-")}`,
      });
    }

    // ─── 2. Stale autopilot slots (>15min generating) ───
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: staleSlots } = await sb
      .from("autopilot_queue")
      .select("id, user_id, status, scheduled_for, updated_at")
      .in("status", ["generating_video", "generating_image"])
      .lt("updated_at", fifteenMinAgo)
      .limit(50);

    if (staleSlots && staleSlots.length > 0) {
      const ids = staleSlots.map((s: any) => s.id);
      await sb
        .from("autopilot_queue")
        .update({
          status: "failed",
          error_message: "Watchdog auto-fail: generation stuck >15min",
        })
        .in("id", ids);
      rowsAutoFailed += ids.length;
      anomalies.push({
        kind: "workflow",
        severity: "high",
        title: `Watchdog: ${ids.length} autopilot slots stuck generating >15min`,
        description: `Auto-failed slot ids:\n${ids.join("\n")}\n\nRefund worker should pick these up via cron-poller.`,
        fingerprint: `autopilot-stale`,
      });
    }

    // ─── 3. Stale lambda renders (>20min, no completion) ───
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: staleLambda } = await sb
      .from("lambda_health_metrics")
      .select("id, render_id, function_name, created_at")
      .is("status", null)
      .lt("created_at", twentyMinAgo)
      .limit(20);

    if (staleLambda && staleLambda.length > 0) {
      anomalies.push({
        kind: "workflow",
        severity: "medium",
        title: `Watchdog: ${staleLambda.length} Lambda renders without status >20min`,
        description: staleLambda
          .map((l: any) => `- render_id=${l.render_id} fn=${l.function_name} since=${l.created_at}`)
          .join("\n"),
        fingerprint: `lambda-stale`,
      });
    }

    // ─── 4. Stale two-shot lipsync (>10min running, or pre-pass master_clip >2min) ───
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: runningLipsync } = await sb
      .from("composer_scenes")
      .select("id, project_id, engine_override, lip_sync_status, twoshot_stage, updated_at, clip_error, replicate_prediction_id, audio_plan")
      .eq("lip_sync_status", "running")
      .limit(100);

    const staleLipsync = (runningLipsync ?? []).filter((s: any) => {
      const stage = String(s.twoshot_stage ?? "");
      const heartbeat = s?.audio_plan?.twoshot?.heartbeat ?? null;
      const predictionId = String(s.replicate_prediction_id ?? "");
      // Sync.so jobs may legitimately run >10min (Pro plan, two passes). The
      // async poller (`poll-twoshot-lipsync`) watches them — don't auto-fail
      // here. Only kill those when stuck >30min AND no recent heartbeat poll.
      const isAsyncSyncJob = predictionId.startsWith("sync:");
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const lastPolledAt = String(heartbeat?.lastPolledAt ?? heartbeat?.started_at ?? s.updated_at ?? "");
      if (isAsyncSyncJob) {
        return lastPolledAt < thirtyMinAgo;
      }
      const oldEnough = String(s.updated_at ?? "") < tenMinAgo;
      const stuckBeforePass =
        s.engine_override === "cinematic-sync" &&
        stage === "master_clip" &&
        !heartbeat &&
        String(s.updated_at ?? "") < twoMinAgo;
      return oldEnough || stuckBeforePass;
    });


    if (staleLipsync && staleLipsync.length > 0) {
      const ids = staleLipsync.map((s: any) => s.id);
      const projectIds = [...new Set(staleLipsync.map((s: any) => s.project_id).filter(Boolean))];
      const { data: projects } = projectIds.length
        ? await sb.from("composer_projects").select("id, user_id").in("id", projectIds)
        : { data: [] as any[] };
      const userByProject = new Map((projects ?? []).map((p: any) => [p.id, p.user_id]));
      const refundByUser = new Map<string, number>();
      for (const scene of staleLipsync as any[]) {
        const uid = userByProject.get(scene.project_id);
        if (!uid) continue;
        refundByUser.set(uid, (refundByUser.get(uid) ?? 0) + 28);
      }
      for (const [userId, amount] of refundByUser.entries()) {
        const { data: wallet } = await sb.from("wallets").select("balance").eq("user_id", userId).single();
        if (wallet) {
          await sb.from("wallets").update({
            balance: (Number(wallet.balance) || 0) + amount,
            updated_at: new Date().toISOString(),
          }).eq("user_id", userId);
        }
      }
      await sb
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "watchdog_stuck_lipsync_refunded",
          updated_at: new Date().toISOString(),
        })
        .in("id", ids);
      rowsAutoFailed += ids.length;
      anomalies.push({
        kind: "workflow",
        severity: "high",
        title: `Watchdog: ${ids.length} two-shot lipsync jobs stuck >10min`,
        description: `Auto-failed and refunded stale lipsync scene ids:\n${staleLipsync
          .map((s: any) => `- ${s.id} stage=${s.twoshot_stage ?? "null"} prediction=${s.replicate_prediction_id ?? "null"} updated=${s.updated_at}`)
          .join("\n")}`,
        fingerprint: "twoshot-lipsync-stale",
      });
    }

    // ─── 4b. Stale composer master-clip (>10min generating, no webhook) ───
    // Replicate occasionally drops webhook callbacks for Hailuo/HappyHorse/Kling
    // master plates. Without a watchdog the scene stays on
    // `clip_status='generating'` forever and lipsync never starts.
    // Dispatch the recovery worker which polls Replicate directly and either
    // replays the webhook (success) or fails+refunds the scene.
    const { data: stuckClips } = await sb
      .from("composer_scenes")
      .select(
        "id, project_id, replicate_prediction_id, updated_at, engine_override, clip_source",
      )
      .eq("clip_status", "generating")
      .is("clip_url", null)
      .lt("updated_at", tenMinAgo)
      .limit(50);

    if (stuckClips && stuckClips.length > 0) {
      const ids = stuckClips.map((s: any) => s.id);
      try {
        await sb.functions.invoke("recover-stuck-composer-clip", {
          body: { scene_ids: ids },
        });
      } catch (recoverErr) {
        console.error(
          "[qa-watchdog] recover-stuck-composer-clip invoke failed:",
          recoverErr,
        );
      }
      anomalies.push({
        kind: "workflow",
        severity: "high",
        title: `Watchdog: ${ids.length} composer master-clips stuck >10min`,
        description: `Dispatched recover-stuck-composer-clip for:\n${stuckClips
          .map(
            (s: any) =>
              `- ${s.id} engine=${s.engine_override ?? "none"} src=${s.clip_source} pred=${s.replicate_prediction_id ?? "null"} updated=${s.updated_at}`,
          )
          .join("\n")}`,
        fingerprint: "composer-clip-stale",
      });
    }



    // ─── 5. Provider quota outage (>50% fail rate, ≥10 calls in last 10min) ───
    const { data: recentCalls } = await sb
      .from("provider_quota_log")
      .select("provider, success")
      .gte("created_at", tenMinAgo)
      .limit(2000);

    if (recentCalls && recentCalls.length > 0) {
      const byProv = new Map<string, { ok: number; total: number }>();
      for (const r of recentCalls as any[]) {
        const b = byProv.get(r.provider) ?? { ok: 0, total: 0 };
        b.total += 1;
        if (r.success) b.ok += 1;
        byProv.set(r.provider, b);
      }
      for (const [provider, b] of byProv.entries()) {
        if (b.total >= 10 && b.ok / b.total < 0.5) {
          anomalies.push({
            kind: "regression",
            severity: "high",
            title: `Watchdog: ${provider} failing ${b.total - b.ok}/${b.total} calls (last 10min)`,
            description: `Provider \`${provider}\` has a failure rate of ${Math.round(
              (1 - b.ok / b.total) * 100,
            )}% in the last 10 minutes (${b.total} calls). Likely upstream outage or auth issue.`,
            fingerprint: `provider-outage-${provider}`,
          });
        }
      }
    }

    // ─── 6. Stale cron heartbeats (missed 2× expected interval) ───
    const { data: heartbeats } = await sb
      .from("cron_heartbeats")
      .select("job_name, last_run_at, expected_interval_seconds, consecutive_failures, last_error");

    if (heartbeats) {
      const now = Date.now();
      for (const hb of heartbeats as any[]) {
        const lastMs = new Date(hb.last_run_at).getTime();
        const ageSec = (now - lastMs) / 1000;
        const tolerance = (hb.expected_interval_seconds ?? 300) * 2;
        if (ageSec > tolerance) {
          anomalies.push({
            kind: "regression",
            severity: "high",
            title: `Watchdog: cron job '${hb.job_name}' stale (last run ${Math.round(ageSec)}s ago)`,
            description: `Job \`${hb.job_name}\` expected every ${hb.expected_interval_seconds}s but last heartbeat was ${Math.round(ageSec)}s ago. Consecutive failures: ${hb.consecutive_failures}. Last error: ${hb.last_error ?? "(none)"}.`,
            fingerprint: `cron-stale-${hb.job_name}`,
          });
        } else if (hb.consecutive_failures >= 3) {
          anomalies.push({
            kind: "regression",
            severity: "medium",
            title: `Watchdog: cron job '${hb.job_name}' failing repeatedly (${hb.consecutive_failures}× in a row)`,
            description: `Last error: ${hb.last_error ?? "(unknown)"}`,
            fingerprint: `cron-failing-${hb.job_name}`,
          });
        }
      }
    }

    // ─── File bugs ───
    let bugsCreated = 0;
    for (const a of anomalies) {
      if (await fileBug(sb, a)) bugsCreated += 1;
    }

    const duration = Date.now() - start;
    await sb.from("qa_watchdog_runs").insert({
      duration_ms: duration,
      anomalies_found: anomalies.length,
      bugs_created: bugsCreated,
      rows_auto_failed: rowsAutoFailed,
      summary: { anomalies: anomalies.map((a) => ({ kind: a.kind, title: a.title })) },
    });

    await recordHeartbeat({
      jobName: "qa-watchdog",
      status: "ok",
      durationMs: duration,
      expectedIntervalSeconds: 120,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        duration_ms: duration,
        anomalies_found: anomalies.length,
        bugs_created: bugsCreated,
        rows_auto_failed: rowsAutoFailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordHeartbeat({
      jobName: "qa-watchdog",
      status: "error",
      durationMs: Date.now() - start,
      error: msg,
      expectedIntervalSeconds: 120,
    });
    console.error("[watchdog] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
