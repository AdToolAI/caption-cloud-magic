import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUSH_MESSAGES = {
  de: {
    title: "Deine Streak ist in Gefahr ⚡",
    body: (days: number) => `${days} Tage in Folge — verliere sie nicht! Mach jetzt eine kleine Aktion.`,
  },
  en: {
    title: "Your streak is in danger ⚡",
    body: (days: number) => `${days} days in a row — don't lose it! Take a quick action now.`,
  },
  es: {
    title: "Tu racha está en peligro ⚡",
    body: (days: number) => `${days} días seguidos — ¡no la pierdas! Realiza una acción rápida ahora.`,
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const sendWarnings = url.searchParams.get("send_warnings") === "true";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Run break logic via RPC
    const { data: brokenCount, error: rpcError } = await supabase.rpc("break_stale_streaks" as any);

    if (rpcError) {
      console.error("[check-streak-breaks] RPC error:", rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[check-streak-breaks] Broke ${brokenCount} streaks`);

    let warningsSent = 0;

    // 2. Optional: warning push at 22:00 — find users whose last activity was today
    //    but who haven't acted recently. We send to users where last_activity_date = today - 0 days
    //    is NOT yet reached (i.e. they may forget). Simpler: warn users whose last_activity_date = today
    //    and current_streak >= 3 if it's late evening (caller decides via send_warnings flag).
    if (sendWarnings) {
      const today = new Date().toISOString().slice(0, 10);

      const { data: atRiskUsers } = await supabase
        .from("user_streaks")
        .select("user_id, current_streak, last_activity_date")
        .eq("last_activity_date", today) // already done today → no warning
        .gte("current_streak", 3);

      // Inverse: users with streak >= 3 who have NOT acted today
      const { data: needWarning } = await supabase
        .from("user_streaks")
        .select("user_id, current_streak")
        .neq("last_activity_date", today)
        .gte("current_streak", 3);

      if (needWarning && needWarning.length > 0) {
        for (const u of needWarning) {
          // Check push prefs
          const { data: prefs } = await supabase
            .from("notification_preferences")
            .select("push_enabled, reminder_pushes_enabled, push_subscription")
            .eq("user_id", u.user_id)
            .maybeSingle();

          if (!prefs?.push_enabled || !prefs?.reminder_pushes_enabled || !prefs?.push_subscription) continue;

          // Get language
          const { data: profile } = await supabase
            .from("profiles")
            .select("language")
            .eq("id", u.user_id)
            .maybeSingle();

          const lang = (profile?.language || "en") as keyof typeof PUSH_MESSAGES;
          const msg = PUSH_MESSAGES[lang] || PUSH_MESSAGES.en;

          try {
            await supabase.functions.invoke("send-push-notification", {
              body: {
                user_id: u.user_id,
                title: msg.title,
                body: msg.body(u.current_streak),
                url: "/home",
              },
            });
            warningsSent++;
          } catch (err) {
            console.error(`[check-streak-breaks] Push failed for ${u.user_id}:`, err);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, broken: brokenCount, warnings_sent: warningsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[check-streak-breaks] Exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
