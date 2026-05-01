import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });
  const acc = await stripe.accounts.retrieve();
  const products = await stripe.products.list({ active: true, limit: 100 });
  const result: any = {
    account: { id: acc.id, country: acc.country, email: acc.email, name: acc.business_profile?.name, settings_name: acc.settings?.dashboard?.display_name },
    products: [],
  };
  for (const p of products.data) {
    const prices = await stripe.prices.list({ product: p.id, limit: 10 });
    result.products.push({
      id: p.id,
      name: p.name,
      active: p.active,
      default_price: p.default_price,
      prices: prices.data.map((pr) => ({
        id: pr.id, currency: pr.currency, amount: pr.unit_amount, active: pr.active, lookup: pr.lookup_key, nickname: pr.nickname,
      })),
    });
  }
  const coupons = await stripe.coupons.list({ limit: 20 });
  result.coupons = coupons.data.map((c) => ({ id: c.id, name: c.name, off: c.amount_off, dur: c.duration, months: c.duration_in_months, valid: c.valid }));
  return new Response(JSON.stringify(result, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
