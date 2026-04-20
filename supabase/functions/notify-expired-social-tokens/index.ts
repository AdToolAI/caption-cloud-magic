import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find expired tokens that haven't been notified in last 24h
    const { data: expired, error } = await supabase
      .from("social_connections")
      .select("id, user_id, provider, account_name, token_expires_at")
      .lt("token_expires_at", new Date().toISOString())
      .not("token_expires_at", "is", null);

    if (error) throw error;

    if (!expired || expired.length === 0) {
      return new Response(JSON.stringify({ notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let notified = 0;
    for (const conn of expired) {
      // Check if recent alert already exists (last 24h) — dedupe
      const { data: existing } = await supabase
        .from("alert_notifications")
        .select("id")
        .eq("alert_type", `social_token_expired:${conn.id}`)
        .gte("sent_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .limit(1);

      if (existing && existing.length > 0) continue;

      await supabase.from("alert_notifications").insert({
        alert_type: `social_token_expired:${conn.id}`,
        severity: "warning",
        metric_value: 1,
        threshold: 0,
        message: `Social-Token abgelaufen: ${conn.provider} (${conn.account_name || "unbekannt"}) — Reconnect erforderlich (User ${conn.user_id})`,
      });

      notified++;
    }

    console.log(`[notify-expired-social-tokens] Notified ${notified} expired tokens`);

    return new Response(
      JSON.stringify({ notified, total_expired: expired.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[notify-expired-social-tokens] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
