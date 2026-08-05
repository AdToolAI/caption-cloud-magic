import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

/**
 * v412: Gibt eine reservierte (noch nicht bezahlte) Gutschein-Einlösung frei,
 * damit ein Nutzer nicht dauerhaft blockiert ist, wenn er den Checkout abbricht.
 * Löscht ausschließlich die eigene Zeile im Status `reserved`.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "release-promo-code" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, reason: "unauthorized" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return json({ ok: false, reason: "unauthorized" }, 401);

    const { error } = await admin
      .from("promo_redemptions")
      .delete()
      .eq("user_id", user.id)
      .eq("status", "reserved");

    if (error) {
      console.error("[release-promo-code] delete failed:", error.message);
      return json({ ok: false, reason: "internal" }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("[release-promo-code] error:", error);
    return json({ ok: false, reason: "internal" }, 500);
  }
});
