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
  return new Response(
    JSON.stringify({
      account: { id: acc.id, country: acc.country, email: acc.email, business: acc.business_profile?.name },
      products: products.data.map((p) => ({
        id: p.id,
        name: p.name,
        default_price: p.default_price,
      })),
      count: products.data.length,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
