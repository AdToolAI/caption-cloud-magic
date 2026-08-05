import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
import { STRIPE_API_VERSION } from "../_shared/stripe-config.ts";
import {
  PROMO_SELECT,
  type PromoRow,
  benefitLabel,
  checkPromoRow,
  normalizeCode,
} from "../_shared/promo.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "redeem-promo-code" });

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

    const body = await req.json().catch(() => ({}));
    const code = normalizeCode((body as Record<string, unknown>).code);
    const lang = String((body as Record<string, unknown>).lang ?? "de");
    if (!code) return json({ ok: false, reason: "invalid" });

    const { data: rowRaw } = await admin
      .from("promo_codes")
      .select(PROMO_SELECT)
      .eq("code", code)
      .maybeSingle();

    const row = rowRaw as PromoRow | null;
    const check = checkPromoRow(row);
    if (!check.ok || !row) return json({ ok: false, reason: check.reason ?? "invalid" });

    // Nutzer darf nur einen Code einlösen
    const { data: existing } = await admin
      .from("promo_redemptions")
      .select("id, code, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) return json({ ok: false, reason: "already_redeemed", code: existing.code });

    // Kein aktives Abo
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey && user.email) {
      const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        const subs = await stripe.subscriptions.list({
          customer: customers.data[0].id,
          status: "active",
          limit: 1,
        });
        if (subs.data.length > 0) return json({ ok: false, reason: "has_subscription" });
      }
    }

    const { error: insertErr } = await admin.from("promo_redemptions").insert({
      user_id: user.id,
      promo_code_id: row.id,
      code: row.code,
      status: "reserved",
    });
    if (insertErr) {
      console.error("[redeem-promo-code] insert failed:", insertErr.message);
      return json({ ok: false, reason: "already_redeemed" });
    }

    return json({
      ok: true,
      code: row.code,
      benefit: benefitLabel(row, lang),
      discount_percent: row.discount_percent,
      duration_months: row.duration_months,
      promotion_code: row.stripe_promo_id,
    });
  } catch (error) {
    console.error("[redeem-promo-code] error:", error);
    return json({ ok: false, reason: "internal" }, 500);
  }
});
