// Mint / revoke a public share-token for a Brand Kit.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: "share-brand-kit", token: "mock-token" });

  try {
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    const userId = JSON.parse(atob(authHeader.replace("Bearer ", "").split(".")[1])).sub;

    const { brandKitId, action = "create", expiresInDays = 30 } = await req.json();
    const { data: kit } = await supa.from("brand_kits").select("id, user_id, share_token").eq("id", brandKitId).eq("user_id", userId).single();
    if (!kit) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: corsHeaders });

    if (action === "revoke") {
      await supa.from("brand_kits").update({ share_token: null, share_expires_at: null }).eq("id", brandKitId);
      return new Response(JSON.stringify({ ok: true, token: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = (kit as any).share_token || crypto.randomUUID().replace(/-/g, "");
    const expires = new Date(Date.now() + expiresInDays * 86400_000).toISOString();
    await supa.from("brand_kits").update({ share_token: token, share_expires_at: expires }).eq("id", brandKitId);

    return new Response(JSON.stringify({ ok: true, token, expires_at: expires }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("share-brand-kit error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
