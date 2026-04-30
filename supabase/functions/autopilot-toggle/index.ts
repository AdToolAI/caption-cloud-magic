// Autopilot Toggle — activates/deactivates with strike & lock validation, writes consent + activity log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface Body {
  activate: boolean;
  consentTextHash?: string;
  consentTextVersion?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(supabaseUrl, service);

    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) {
      return json({ ok: false, error: "Not authenticated" }, 401);
    }
    const userId = u.user.id;

    const body = (await req.json()) as Body;

    // Hard-stop: terminated user
    const { data: profile } = await admin
      .from("profiles")
      .select("autopilot_permanently_locked, autopilot_lock_reason, terminated_at")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.terminated_at || profile?.autopilot_permanently_locked) {
      return json({
        ok: false,
        lock_reason: profile?.autopilot_lock_reason ?? "permanent_lock",
        error: "Account oder Autopilot dauerhaft gesperrt.",
      }, 403);
    }

    const { data: brief } = await admin
      .from("autopilot_briefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!brief) {
      return json({ ok: false, error: "Bitte zuerst Brand-Brief speichern." }, 400);
    }

    if (brief.locked_until && new Date(brief.locked_until) > new Date()) {
      return json({
        ok: false,
        lock_reason: "temporary_lock",
        error: `Autopilot gesperrt bis ${new Date(brief.locked_until).toLocaleString()}`,
      }, 403);
    }

    // Strike audit on activate
    if (body.activate) {
      const { data: activeStrikes } = await admin
        .from("autopilot_strikes")
        .select("severity")
        .eq("user_id", userId)
        .eq("is_active", true);
      const critCount = (activeStrikes ?? []).filter((s) => s.severity === "critical").length;
      const hardCount = (activeStrikes ?? []).filter((s) => s.severity === "hard").length;
      if (critCount > 0) {
        return json({ ok: false, error: "Aktivierung blockiert wegen Critical-Strikes." }, 403);
      }
      if (hardCount >= 2) {
        return json({ ok: false, error: "2+ aktive Hard-Strikes — bitte Support kontaktieren." }, 403);
      }
      if (!body.consentTextVersion) {
        return json({ ok: false, error: "AUP-Consent fehlt." }, 400);
      }
    }

    const patch: Record<string, unknown> = {
      is_active: body.activate,
      activated_at: body.activate ? new Date().toISOString() : brief.activated_at,
    };
    const { error: upd } = await admin
      .from("autopilot_briefs")
      .update(patch)
      .eq("user_id", userId);
    if (upd) throw upd;

    if (body.activate) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      const ua = req.headers.get("user-agent") ?? null;
      const ipHash = ip ? await sha256(ip) : null;
      await admin.from("autopilot_consent_log").insert({
        user_id: userId,
        event_type: "autopilot_activated",
        accepted_text_version: body.consentTextVersion!,
        accepted_text_hash: body.consentTextHash ?? "missing",
        ip_hash: ipHash,
        user_agent: ua,
        metadata: { clauses: ["aup", "no_deepfake", "no_copyright", "termination_acknowledged"] },
      });
    }

    await admin.from("autopilot_activity_log").insert({
      user_id: userId,
      event_type: body.activate ? "autopilot_activated" : "autopilot_deactivated",
      actor: "user",
      payload: {},
    });

    // Trigger initial week plan asynchronously
    if (body.activate) {
      EdgeRuntime.waitUntil(
        admin.functions.invoke("autopilot-plan-week", {
          body: { user_id: userId },
        }).then(() => {}).catch((e) => console.error("plan-week trigger failed", e)),
      );
    }

    return json({ ok: true, is_active: body.activate });
  } catch (e) {
    console.error("autopilot-toggle error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
