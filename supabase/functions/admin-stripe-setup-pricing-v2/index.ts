// Consolidates Pro into a single product with visible prices.
// Idempotent. Run once after deploy.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const CANONICAL_PRO_PRODUCT = "prod_UOG4wbiQjDONAj"; // keep this one
const ORPHAN_PRO_PRODUCT = "prod_UREZAv0LG9vz1E";    // archive this one

const REGULAR_LOOKUP = "pro_monthly_eur_v2_2999";
const PROMO_LOOKUP   = "pro_monthly_eur_promo_1499";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const log: string[] = [];

    // --- 1. Rename canonical product ---
    const canonical = await stripe.products.retrieve(CANONICAL_PRO_PRODUCT);
    if (canonical.name !== "AdTool AI Pro") {
      await stripe.products.update(CANONICAL_PRO_PRODUCT, {
        name: "AdTool AI Pro",
        description: "All-in-one AI content & social media platform",
      });
      log.push(`Renamed ${CANONICAL_PRO_PRODUCT} -> 'AdTool AI Pro'`);
    } else log.push("Canonical product name already correct");

    // --- 2. Ensure regular €29.99 price exists on canonical product ---
    let regular = (await stripe.prices.list({
      lookup_keys: [REGULAR_LOOKUP], limit: 1,
    })).data[0];
    if (regular && regular.product !== CANONICAL_PRO_PRODUCT) {
      // The €29.99 price was created on the orphan product → recreate on canonical
      log.push(`Old €29.99 price ${regular.id} hangs on orphan product, archiving and recreating`);
      try {
        await stripe.prices.update(regular.id, { lookup_key: null as any });
      } catch { /* ignore */ }
      await stripe.prices.update(regular.id, { active: false });
      regular = await stripe.prices.create({
        currency: "eur",
        unit_amount: 2999,
        recurring: { interval: "month" },
        product: CANONICAL_PRO_PRODUCT,
        lookup_key: REGULAR_LOOKUP,
        nickname: "Pro €29.99/month (Regular)",
        metadata: { plan: "pro", tier: "regular_v2" },
      });
      log.push(`Created new regular price ${regular.id}`);
    } else if (!regular) {
      regular = await stripe.prices.create({
        currency: "eur",
        unit_amount: 2999,
        recurring: { interval: "month" },
        product: CANONICAL_PRO_PRODUCT,
        lookup_key: REGULAR_LOOKUP,
        nickname: "Pro €29.99/month (Regular)",
        metadata: { plan: "pro", tier: "regular_v2" },
      });
      log.push(`Created regular price ${regular.id}`);
    } else log.push(`Regular price already on canonical: ${regular.id}`);

    // Set as default price
    if (canonical.default_price !== regular.id) {
      await stripe.products.update(CANONICAL_PRO_PRODUCT, { default_price: regular.id });
      log.push(`Set default_price -> ${regular.id}`);
    }

    // --- 3. Visible €14.99 promo price (display only) ---
    let promo = (await stripe.prices.list({
      lookup_keys: [PROMO_LOOKUP], limit: 1,
    })).data[0];
    if (!promo) {
      promo = await stripe.prices.create({
        currency: "eur",
        unit_amount: 1499,
        recurring: { interval: "month" },
        product: CANONICAL_PRO_PRODUCT,
        lookup_key: PROMO_LOOKUP,
        nickname: "Pro €14.99/month (Launch promo — display only, checkout uses 29.99 + coupon)",
        metadata: { plan: "pro", tier: "promo_display", note: "display_only_do_not_use_at_checkout" },
      });
      log.push(`Created promo display price ${promo.id}`);
    } else log.push(`Promo display price already exists: ${promo.id}`);

    // --- 4. Archive old €19.99 launch price (if still active) ---
    const allOnCanonical = await stripe.prices.list({ product: CANONICAL_PRO_PRODUCT, limit: 50 });
    for (const p of allOnCanonical.data) {
      if (p.unit_amount === 1999 && p.active && p.id !== regular.id && p.id !== promo.id) {
        await stripe.prices.update(p.id, { active: false });
        log.push(`Archived old €19.99 price ${p.id}`);
      }
    }

    // --- 5. Archive orphan product ---
    try {
      const orphan = await stripe.products.retrieve(ORPHAN_PRO_PRODUCT);
      // First archive any prices on it
      const orphanPrices = await stripe.prices.list({ product: ORPHAN_PRO_PRODUCT, limit: 50 });
      for (const p of orphanPrices.data) {
        if (p.active) {
          await stripe.prices.update(p.id, { active: false });
          log.push(`Archived orphan price ${p.id}`);
        }
      }
      if (orphan.active) {
        await stripe.products.update(ORPHAN_PRO_PRODUCT, { active: false });
        log.push(`Archived orphan product ${ORPHAN_PRO_PRODUCT}`);
      }
    } catch (e) {
      log.push(`Orphan product not found / already gone: ${e instanceof Error ? e.message : e}`);
    }

    // --- 6. Verify coupons ---
    for (const cid of ["PRO-FOUNDERS-24M", "PRO-LAUNCH-3M"]) {
      try {
        const c = await stripe.coupons.retrieve(cid);
        log.push(`Coupon OK: ${cid} (valid=${c.valid})`);
      } catch {
        const months = cid === "PRO-FOUNDERS-24M" ? 24 : 3;
        await stripe.coupons.create({
          id: cid,
          name: cid === "PRO-FOUNDERS-24M" ? "Founders Deal — 24 Months" : "Launch Promo — 3 Months",
          amount_off: 1500,
          currency: "eur",
          duration: "repeating",
          duration_in_months: months,
          metadata: { plan: "pro", tier: cid === "PRO-FOUNDERS-24M" ? "founders" : "launch" },
        });
        log.push(`Created missing coupon ${cid}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        canonical_product_id: CANONICAL_PRO_PRODUCT,
        regular_price_id: regular.id,
        promo_display_price_id: promo.id,
        log,
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
