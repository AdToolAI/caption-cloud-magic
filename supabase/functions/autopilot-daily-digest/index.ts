// Cron-driven daily digest for active autopilot users.
// Runs once per day (e.g. 08:00 UTC) and emits one summary notification per user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Active briefs only
    const { data: briefs } = await admin
      .from("autopilot_briefs")
      .select("user_id, weekly_credits_spent, weekly_credit_budget, compliance_score, auto_publish_enabled")
      .eq("is_active", true);

    let sent = 0;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const next72h = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    for (const b of briefs ?? []) {
      // Counts
      const [postedRes, blockedRes, qaRes, upcomingRes] = await Promise.all([
        admin.from("autopilot_queue").select("id", { count: "exact", head: true })
          .eq("user_id", b.user_id).eq("status", "posted").gte("posted_at", since),
        admin.from("autopilot_queue").select("id", { count: "exact", head: true })
          .eq("user_id", b.user_id).in("status", ["blocked", "failed"]).gte("created_at", since),
        admin.from("autopilot_queue").select("id", { count: "exact", head: true })
          .eq("user_id", b.user_id).eq("status", "qa_review"),
        admin.from("autopilot_queue").select("id", { count: "exact", head: true })
          .eq("user_id", b.user_id).eq("status", "scheduled").lte("scheduled_at", next72h),
      ]);

      const posted = postedRes.count ?? 0;
      const blocked = blockedRes.count ?? 0;
      const qa = qaRes.count ?? 0;
      const upcoming = upcomingRes.count ?? 0;

      // Skip silent days when nothing happened
      if (posted === 0 && blocked === 0 && qa === 0 && upcoming === 0) continue;

      const parts: string[] = [];
      if (posted) parts.push(`${posted} live`);
      if (qa) parts.push(`${qa} warten auf Review`);
      if (blocked) parts.push(`${blocked} blockiert`);
      if (upcoming) parts.push(`${upcoming} in 72h geplant`);

      const message = `${parts.join(" · ")} · Compliance ${b.compliance_score}/100 · Budget ${b.weekly_credits_spent}/${b.weekly_credit_budget} cr`;

      await admin.functions.invoke("autopilot-emit-notification", {
        body: {
          user_id: b.user_id,
          type: "autopilot_daily_digest",
          title: "Autopilot Tagesübersicht",
          message,
          metadata: { posted, blocked, qa, upcoming },
          push: qa > 0 || blocked > 0, // only push if action needed
          push_url: "/autopilot",
        },
      });
      sent++;
    }

    return json({ ok: true, sent });
  } catch (e) {
    console.error("daily-digest error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
