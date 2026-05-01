// Creates: Pro Plan v2 product + €29.99 price + 2 coupons. Idempotent.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // 1. Find or create the Pro product
    const products = await stripe.products.search({
      query: "metadata['plan']:'pro' AND metadata['tier']:'regular_v2'",
    });
    let product = products.data[0];
    if (!product) {
      product = await stripe.products.create({
        name: "AdTool AI Pro",
        description: "Pro Plan — full access to AdTool AI features",
        metadata: { plan: "pro", tier: "regular_v2" },
      });
    }

    // 2. EUR price €29.99/month
    const lookupEur = "pro_monthly_eur_v2_2999";
    let priceEur = (await stripe.prices.list({ lookup_keys: [lookupEur], limit: 1 })).data[0];
    if (!priceEur) {
      priceEur = await stripe.prices.create({
        currency: "eur",
        unit_amount: 2999,
        recurring: { interval: "month" },
        product: product.id,
        lookup_key: lookupEur,
        nickname: "Pro €29.99/month",
        metadata: { plan: "pro", tier: "regular_v2" },
      });
    }

    // 3. Coupon: Founders 24M (€15 off)
    let founders: Stripe.Coupon;
    try {
      founders = await stripe.coupons.retrieve("PRO-FOUNDERS-24M");
    } catch {
      founders = await stripe.coupons.create({
        id: "PRO-FOUNDERS-24M",
        name: "Founders Deal — 24 Months",
        amount_off: 1500,
        currency: "eur",
        duration: "repeating",
        duration_in_months: 24,
        metadata: { plan: "pro", tier: "founders" },
      });
    }

    // 4. Coupon: Launch 3M (€15 off)
    let launch: Stripe.Coupon;
    try {
      launch = await stripe.coupons.retrieve("PRO-LAUNCH-3M");
    } catch {
      launch = await stripe.coupons.create({
        id: "PRO-LAUNCH-3M",
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
        product_id: product.id,
        price_eur_id: priceEur.id,
        founders_coupon_id: founders.id,
        launch_coupon_id: launch.id,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
