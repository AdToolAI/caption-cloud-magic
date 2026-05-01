// One-shot admin tool: creates the new Pro €29.99 price + 2 coupons
// (PRO-FOUNDERS-24M, PRO-LAUNCH-3M) on the LIVE Stripe account.
// Idempotent via metadata lookup keys.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRO_PRODUCT_ID_EUR = "prod_UOG4wbiQjDONAj"; // Pro Plan (Launch) EUR
const PRO_PRODUCT_ID_USD = "prod_UOG5TjlcpNNZLZ"; // Pro Plan (Launch) USD

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // ---- 1. New regular Pro Price €29.99 ----
    const lookupEur = "pro_monthly_eur_v2_2999";
    let priceEur = (
      await stripe.prices.list({ lookup_keys: [lookupEur], limit: 1 })
    ).data[0];
    if (!priceEur) {
      priceEur = await stripe.prices.create({
        currency: "eur",
        unit_amount: 2999,
        recurring: { interval: "month" },
        product: PRO_PRODUCT_ID_EUR,
        lookup_key: lookupEur,
        nickname: "Pro Plan €29.99/month (Regular v2)",
        metadata: { plan: "pro", tier: "regular_v2" },
      });
    }

    // ---- 2. New regular Pro Price $29.99 (USD) ----
    const lookupUsd = "pro_monthly_usd_v2_2999";
    let priceUsd = (
      await stripe.prices.list({ lookup_keys: [lookupUsd], limit: 1 })
    ).data[0];
    if (!priceUsd) {
      priceUsd = await stripe.prices.create({
        currency: "usd",
        unit_amount: 2999,
        recurring: { interval: "month" },
        product: PRO_PRODUCT_ID_USD,
        lookup_key: lookupUsd,
        nickname: "Pro Plan $29.99/month (Regular v2)",
        metadata: { plan: "pro", tier: "regular_v2" },
      });
    }

    // ---- 3. Coupon: Founders 24M (€15 off) ----
    const foundersId = "PRO-FOUNDERS-24M";
    let foundersCoupon: Stripe.Coupon | null = null;
    try {
      foundersCoupon = await stripe.coupons.retrieve(foundersId);
    } catch (_) {
      foundersCoupon = await stripe.coupons.create({
        id: foundersId,
        name: "Founders Deal — 24 Months",
        amount_off: 1500,
        currency: "eur",
        duration: "repeating",
        duration_in_months: 24,
        metadata: { plan: "pro", tier: "founders" },
      });
    }

    // ---- 4. Coupon: Launch 3M (€15 off) ----
    const launchId = "PRO-LAUNCH-3M";
    let launchCoupon: Stripe.Coupon | null = null;
    try {
      launchCoupon = await stripe.coupons.retrieve(launchId);
    } catch (_) {
      launchCoupon = await stripe.coupons.create({
        id: launchId,
        name: "Launch Promo — 3 Months",
        amount_off: 1500,
        currency: "eur",
        duration: "repeating",
        duration_in_months: 3,
        metadata: { plan: "pro", tier: "launch" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        price_eur_id: priceEur.id,
        price_usd_id: priceUsd.id,
        founders_coupon_id: foundersCoupon!.id,
        launch_coupon_id: launchCoupon!.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
