import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface CheckResult {
  check: string;
  count: number;
  severity: "info" | "warning" | "critical";
  action_taken?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: CheckResult[] = [];
  const alerts: Array<{ alert_type: string; severity: string; message: string; metric_value: number; threshold: number }> = [];

  try {
    // 1. Profiles without storage quota → auto-backfill
    const { data: missingQuota } = await supabase
      .from("profiles")
      .select("id")
      .not("id", "in", `(SELECT user_id FROM user_storage_quotas)`);
    // Fallback: query manually since not().in() with subquery isn't supported
    const { data: allProfiles } = await supabase.from("profiles").select("id");
    const { data: allQuotas } = await supabase.from("user_storage_quotas").select("user_id");
    const quotaSet = new Set((allQuotas || []).map((q) => q.user_id));
    const missing = (allProfiles || []).filter((p) => !quotaSet.has(p.id));

    if (missing.length > 0) {
      const inserts = missing.map((p) => ({
        user_id: p.id,
        quota_mb: 2048,
        plan_tier: "free",
      }));
      await supabase.from("user_storage_quotas").upsert(inserts, { onConflict: "user_id" });
      results.push({ check: "profiles_missing_quota", count: missing.length, severity: "warning", action_taken: "auto_backfilled" });
      alerts.push({
        alert_type: "consistency:missing_storage_quota",
        severity: "warning",
        metric_value: missing.length,
        threshold: 0,
        message: `${missing.length} Profile ohne Storage-Quota → automatisch backfilled`,
      });
    } else {
      results.push({ check: "profiles_missing_quota", count: 0, severity: "info" });
    }

    // 2. Stale scheduled calendar events (>1h overdue)
    const { data: staleEvents, count: staleCount } = await supabase
      .from("calendar_events")
      .select("id", { count: "exact" })
      .eq("status", "scheduled")
      .lt("start_at", new Date(Date.now() - 3600 * 1000).toISOString())
      .limit(100);

    if ((staleCount || 0) > 5) {
      alerts.push({
        alert_type: "consistency:stale_calendar_events",
        severity: "critical",
        metric_value: staleCount || 0,
        threshold: 5,
        message: `${staleCount} Calendar Events sind über 1h überfällig — Dispatcher prüfen!`,
      });
    }
    results.push({ check: "stale_calendar_events", count: staleCount || 0, severity: (staleCount || 0) > 5 ? "critical" : "info" });

    // 3. Active AI jobs older than 2h → auto-cleanup
    const { data: oldJobs, count: oldJobsCount } = await supabase
      .from("active_ai_jobs")
      .select("id", { count: "exact" })
      .lt("started_at", new Date(Date.now() - 2 * 3600 * 1000).toISOString());

    if ((oldJobsCount || 0) > 0) {
      await supabase
        .from("active_ai_jobs")
        .delete()
        .lt("started_at", new Date(Date.now() - 2 * 3600 * 1000).toISOString());
      alerts.push({
        alert_type: "consistency:stale_active_jobs",
        severity: "warning",
        metric_value: oldJobsCount || 0,
        threshold: 0,
        message: `${oldJobsCount} AI-Jobs hingen >2h → bereinigt`,
      });
    }
    results.push({ check: "stale_active_jobs", count: oldJobsCount || 0, severity: "info", action_taken: "auto_cleaned" });

    // 4. Expired social tokens
    const { count: expiredTokensCount } = await supabase
      .from("social_connections")
      .select("id", { count: "exact", head: true })
      .lt("token_expires_at", new Date().toISOString())
      .not("token_expires_at", "is", null);

    if ((expiredTokensCount || 0) > 0) {
      // Trigger notification function
      await supabase.functions.invoke("notify-expired-social-tokens", { body: {} });
      alerts.push({
        alert_type: "consistency:expired_social_tokens",
        severity: "warning",
        metric_value: expiredTokensCount || 0,
        threshold: 0,
        message: `${expiredTokensCount} abgelaufene Social-Tokens → User benachrichtigt`,
      });
    }
    results.push({ check: "expired_social_tokens", count: expiredTokensCount || 0, severity: "info" });

    // 5. AI video generations stuck >30 min in processing
    const { count: stuckVideos } = await supabase
      .from("ai_video_generations")
      .select("id", { count: "exact", head: true })
      .in("status", ["processing", "started"])
      .lt("started_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

    if ((stuckVideos || 0) > 0) {
      alerts.push({
        alert_type: "consistency:stuck_video_generations",
        severity: "critical",
        metric_value: stuckVideos || 0,
        threshold: 0,
        message: `${stuckVideos} AI-Video-Generations stuck >30min — Refund-Check nötig`,
      });
    }
    results.push({ check: "stuck_video_generations", count: stuckVideos || 0, severity: (stuckVideos || 0) > 0 ? "critical" : "info" });

    // 6. ai_video_wallets with negative balance
    const { count: negWallets } = await supabase
      .from("ai_video_wallets")
      .select("id", { count: "exact", head: true })
      .lt("balance_euros", 0);

    if ((negWallets || 0) > 0) {
      alerts.push({
        alert_type: "consistency:negative_wallet_balance",
        severity: "critical",
        metric_value: negWallets || 0,
        threshold: 0,
        message: `${negWallets} Wallets mit negativem Balance — KRITISCH!`,
      });
    }
    results.push({ check: "negative_wallet_balance", count: negWallets || 0, severity: (negWallets || 0) > 0 ? "critical" : "info" });

    // 7. Director cut renders stuck >1h
    const { count: stuckRenders } = await supabase
      .from("director_cut_renders")
      .select("id", { count: "exact", head: true })
      .in("status", ["rendering", "started"])
      .lt("created_at", new Date(Date.now() - 3600 * 1000).toISOString());

    if ((stuckRenders || 0) > 0) {
      alerts.push({
        alert_type: "consistency:stuck_director_cut_renders",
        severity: "warning",
        metric_value: stuckRenders || 0,
        threshold: 0,
        message: `${stuckRenders} Director's Cut Renders hängen >1h`,
      });
    }
    results.push({ check: "stuck_director_cut_renders", count: stuckRenders || 0, severity: "info" });

    // 8. Orphaned campaign posts (no content_items)
    const { data: cpAll } = await supabase.from("campaign_posts").select("id");
    const { data: ciCampaign } = await supabase
      .from("content_items")
      .select("source_id")
      .eq("source", "campaign");
    const ciSet = new Set((ciCampaign || []).map((c) => c.source_id));
    const orphans = (cpAll || []).filter((cp) => !ciSet.has(cp.id));
    if (orphans.length > 0) {
      alerts.push({
        alert_type: "consistency:orphan_campaign_posts",
        severity: "warning",
        metric_value: orphans.length,
        threshold: 0,
        message: `${orphans.length} Campaign Posts ohne Calendar-Sync — manueller Resync empfohlen`,
      });
    }
    results.push({ check: "orphan_campaign_posts", count: orphans.length, severity: "info" });

    // Insert all alerts
    if (alerts.length > 0) {
      await supabase.from("alert_notifications").insert(alerts);
    }

    return new Response(
      JSON.stringify({ ok: true, ran_at: new Date().toISOString(), results, alerts_emitted: alerts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[consistency-watcher] Error:", err);
    return new Response(JSON.stringify({ error: err.message, partial_results: results }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
