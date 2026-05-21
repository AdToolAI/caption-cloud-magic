/**
 * twoshot-lipsync-watchdog — server-side stability layer for the Two-Shot /
 * Cinematic-Sync lip-sync pipeline.
 *
 * Runs every 60 s via pg_cron. Three jobs:
 *
 *  1. POLL running Sync.so jobs → invokes `poll-twoshot-lipsync` for any
 *     scene with `replicate_prediction_id LIKE 'sync:%'` and status='running'.
 *     Means: lip-sync chains pass→pass and completes even if the user
 *     closed the composer tab.
 *
 *  2. REFUND stuck pre-Sync scenes → if a scene has been
 *     `lip_sync_status='running'` for >8 min WITHOUT a sync job recorded
 *     in `audio_plan.twoshot.syncJobs.jobs[]`, the upstream
 *     `compose-twoshot-lipsync` hung (face audit / audio fetch). Mark
 *     `failed` + refund credits.
 *
 *  3. RE-TRIGGER auto-reset stale scenes → if the client-side stale
 *     recovery reset a scene to `pending` (clip_error contains
 *     'auto-reset') and it's been sitting idle >2 min without re-invoke,
 *     we re-invoke `compose-twoshot-lipsync` here so it runs even if the
 *     user is not in the composer.
 *
 * Idempotent: safe to call concurrently or repeatedly.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { appendTwoshotDiag } from "../_shared/twoshotDiagnostics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_PRESYNC_MS = 8 * 60 * 1000; // 8 min: no sync job ever recorded
const STALE_PREFLIGHT_MS = 2 * 60 * 1000; // 2 min: CPU/preflight abort before Sync.so submit
const STALE_SYNC_POLL_MS = 12 * 60 * 1000; // 12 min: Sync.so job stuck
const STALE_RESET_REINVOKE_MS = 2 * 60 * 1000; // 2 min: auto-reset, re-fire

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const invokeFn = async (name: string, body: Record<string, unknown>) => {
    const r = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });
    if (!r.ok && r.status >= 500) {
      const txt = await r.text().catch(() => "");
      throw new Error(`${name}_${r.status}: ${txt.slice(0, 200)}`);
    }
    return r;
  };

  const summary = {
    polled: 0,
    refundedPresync: 0,
    refundedSyncTimeout: 0,
    recoveredPreflight: 0,
    reinvoked: 0,
    errors: [] as string[],
  };



  try {
    const now = Date.now();
    const nowIso = new Date().toISOString();

    // ── Fetch all cinematic-sync scenes that might need attention ──────
    const { data: scenes, error } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, lip_sync_status, lip_sync_applied_at, clip_url, clip_error, replicate_prediction_id, twoshot_stage, audio_plan, updated_at, engine_override",
      )
      .eq("engine_override", "cinematic-sync")
      .is("lip_sync_applied_at", null)
      .in("lip_sync_status", ["running", "pending"])
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      summary.errors.push(`query: ${error.message}`);
      return json({ ok: false, summary }, 500);
    }

    for (const s of scenes ?? []) {
      const updatedAt = s.updated_at ? new Date(s.updated_at).getTime() : 0;
      const ageMs = now - updatedAt;
      const twoshot = (s.audio_plan as any)?.twoshot ?? {};
      const syncJobs = twoshot.syncJobs ?? {};
      const jobs = Array.isArray(syncJobs.jobs) ? syncJobs.jobs : [];
      const hasSyncJob =
        typeof s.replicate_prediction_id === "string" &&
        s.replicate_prediction_id.startsWith("sync:");
      const hasHeartbeat = !!twoshot?.heartbeat?.syncJobId;
      const stage = String(s.twoshot_stage ?? "");
      const hasAnyRecordedProviderJob = hasSyncJob || hasHeartbeat || jobs.length > 0;

      // ── Job 0: ZOMBIE STATE — lipsync_* stage but no real provider job.
      // This is the "stuck at 95%" symptom: client reset status to pending
      // but the old stage marker remains, so neither side restarts.
      // Reset and re-invoke compose-twoshot-lipsync from a clean slate.
      if (
        s.lip_sync_status === "pending" &&
        /^lipsync_/i.test(stage) &&
        !hasSyncJob &&
        !hasHeartbeat &&
        jobs.length === 0 &&
        typeof s.clip_url === "string" &&
        s.clip_url.length > 0 &&
        ageMs > 60_000 // give the compose function 1 min to recover on its own
      ) {
        try {
          await supabase
            .from("composer_scenes")
            .update({
              twoshot_stage: null,
              replicate_prediction_id: null,
              clip_error: "auto-retry: zombie_lipsync_stage_without_sync_job",
              updated_at: nowIso,
            })
            .eq("id", s.id);
          await appendTwoshotDiag(supabase, s.id, {
            source: "watchdog",
            event: "zombie_state_cleared",
            stage: stage,
            status: "pending",
            reason: `ageMs=${ageMs} no sync job, no heartbeat`,
          });
          await invokeFn("compose-twoshot-lipsync", { scene_id: s.id });
          summary.reinvoked++;
          console.log(`[twoshot-watchdog ${s.id}] zombie state cleared, reinvoked (stage=${stage}, ageMs=${ageMs})`);
        } catch (e) {
          summary.errors.push(`zombie ${s.id}: ${(e as Error).message}`);
        }
        continue;
      }

      // ── Job 1: poll running Sync.so jobs ─────────────────────────────
      if (s.lip_sync_status === "running" && hasSyncJob) {
        // Stale sync.so job — refund
        if (ageMs > STALE_SYNC_POLL_MS) {
          try {
            const cost = Number(syncJobs.costCredits ?? 0);
            if (cost > 0 && !syncJobs.refunded) {
              const { data: project } = await supabase
                .from("composer_projects")
                .select("user_id")
                .eq("id", s.project_id)
                .single();
              if (project?.user_id) {
                const { data: wallet } = await supabase
                  .from("wallets")
                  .select("balance")
                  .eq("user_id", project.user_id)
                  .single();
                if (wallet) {
                  await supabase
                    .from("wallets")
                    .update({ balance: Number(wallet.balance ?? 0) + cost, updated_at: nowIso })
                    .eq("user_id", project.user_id);
                }
              }
            }
            await supabase
              .from("composer_scenes")
              .update({
                lip_sync_status: "failed",
                twoshot_stage: "failed",
                clip_error: "syncso_poll_timeout: watchdog auto-failed after 12 min without completion",
                updated_at: nowIso,
                audio_plan: {
                  ...(s.audio_plan as any),
                  twoshot: {
                    ...twoshot,
                    syncJobs: { ...syncJobs, refunded: true, failedAt: nowIso, lastError: "watchdog_timeout", lastErrorAt: nowIso },
                  },
                },
              })
              .eq("id", s.id);
            summary.refundedSyncTimeout++;
          } catch (e) {
            summary.errors.push(`sync_timeout ${s.id}: ${(e as Error).message}`);
          }
          continue;
        }

        // Still within window → poll for completion
        try {
          await invokeFn("poll-twoshot-lipsync", { scene_id: s.id });

          summary.polled++;
        } catch (e) {
          summary.errors.push(`poll ${s.id}: ${(e as Error).message}`);
        }
        continue;
      }

      // ── Job 2: refund stuck pre-Sync scenes ──────────────────────────
      // Running but no sync job recorded → compose-twoshot-lipsync hung
      // before ever queuing Sync.so. Most likely face audit or audio fetch.
      if (
        s.lip_sync_status === "running" &&
        !hasSyncJob &&
        jobs.length === 0 &&
        ageMs > STALE_PRESYNC_MS
      ) {
        try {
          await supabase
            .from("composer_scenes")
            .update({
              lip_sync_status: "failed",
              twoshot_stage: "failed",
              clip_error: "twoshot_presync_timeout: watchdog auto-failed (compose-twoshot-lipsync hung before reaching Sync.so)",
              updated_at: nowIso,
            })
            .eq("id", s.id);
          summary.refundedPresync++;
        } catch (e) {
          summary.errors.push(`presync ${s.id}: ${(e as Error).message}`);
        }
        continue;
      }

      // ── Job 3: re-invoke auto-reset pending scenes ───────────────────
      // The client-side hook may have reset to 'pending' with an
      // 'auto-reset' or 'auto-retry' marker. If the user has left the
      // composer, re-fire compose-twoshot-lipsync here so the pipeline
      // still completes.
      const errMarker = String(s.clip_error ?? "");
      const isAutoReset = /^auto-(reset|retry)/i.test(errMarker);
      const stageAllowed =
        !s.twoshot_stage || s.twoshot_stage === "master_clip" || s.twoshot_stage === "failed";
      if (
        s.lip_sync_status === "pending" &&
        isAutoReset &&
        stageAllowed &&
        typeof s.clip_url === "string" &&
        s.clip_url.length > 0 &&
        ageMs > STALE_RESET_REINVOKE_MS
      ) {
        try {
          await invokeFn("compose-twoshot-lipsync", { scene_id: s.id });

          summary.reinvoked++;
        } catch (e) {
          summary.errors.push(`reinvoke ${s.id}: ${(e as Error).message}`);
        }
      }
    }

    return json({ ok: true, summary, checked: scenes?.length ?? 0 });
  } catch (e) {
    summary.errors.push(`fatal: ${(e as Error).message}`);
    return json({ ok: false, summary }, 500);
  }
});
