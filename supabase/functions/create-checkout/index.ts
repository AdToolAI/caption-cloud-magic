import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { trackBusinessEvent } from "../_shared/telemetry.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import {
  FOUNDERS_COUPON,
  LAUNCH_COUPON,
  FOUNDERS_MAX_SLOTS,
  PRO_PRICE_IDS,
  STRIPE_API_VERSION,
} from "../_shared/stripe-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "create-checkout" });


  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { priceId, promoCode, applyIntro, couponId } = await req.json();
    if (!priceId) throw new Error("Price ID is required");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("Not authenticated");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: STRIPE_API_VERSION,
    });

    console.log(`Checkout: user=${user.id} price=${priceId} promo=${promoCode || "none"} coupon=${couponId || "auto"}`);

    // Find or create Stripe customer
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch {
        customerId = null;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await supabaseClient
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // === Pro auto-coupon logic ===
    let resolvedCoupon: string | null = couponId ?? null;
    let foundersSlotReserved = false;
    let foundersSlotNumber: number | null = null;

    if (!resolvedCoupon && !promoCode && PRO_PRICE_IDS.has(priceId)) {
      // Atomic slot claim via SQL function (advisory lock prevents races)
      const { data: claim, error: claimErr } = await supabaseAdmin.rpc("claim_founders_slot", {
        _user_id: user.id,
        _stripe_customer_id: customerId,
        _founders_coupon: FOUNDERS_COUPON,
        _launch_coupon: LAUNCH_COUPON,
        _max_slots: FOUNDERS_MAX_SLOTS,
      });

      if (claimErr) {
        console.error("claim_founders_slot failed:", claimErr.message);
        // Fail open: no coupon, checkout proceeds at regular price
        resolvedCoupon = null;
      } else {
        const row = Array.isArray(claim) ? claim[0] : claim;
        resolvedCoupon = row?.coupon_id ?? null;
        foundersSlotReserved = !!row?.is_founder;
        foundersSlotNumber = row?.slot_number ?? null;
        console.log(
          `Slot claimed: coupon=${resolvedCoupon} founder=${foundersSlotReserved} slot=${foundersSlotNumber}`,
        );
        if (foundersSlotReserved && foundersSlotNumber) {
          await trackBusinessEvent("founders_slot_claimed", user.id, {
            slot_number: foundersSlotNumber,
            max_slots: FOUNDERS_MAX_SLOTS,
            coupon: FOUNDERS_COUPON,
          });
        }
      }
    }

    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      // Aktive Methoden im Stripe-Dashboard: Card, PayPal, Link.
      // Apple Pay & Google Pay laufen automatisch über 'card' (Domain verifiziert).
      payment_method_types: ["card", "paypal", "link"],
      // Sammle Rechnungsadresse + Name, damit Stripe-Rechnungen korrekt ausgestellt werden.
      // Stripe sendet die finalisierte Rechnung danach automatisch per E-Mail an den Kunden
      // (zusätzlich verschicken wir aus dem Webhook eine gebrandete Quittung).
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      success_url: `${req.headers.get("origin") || Deno.env.get("SITE_URL")}/billing?success=true`,
      cancel_url: `${req.headers.get("origin") || Deno.env.get("SITE_URL")}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        ...(resolvedCoupon ? { applied_coupon: resolvedCoupon } : {}),
        ...(foundersSlotReserved ? { founders_slot: "true" } : {}),
      },
    };

    if (promoCode) {
      sessionOptions.discounts = [{ promotion_code: promoCode }];
    } else if (resolvedCoupon) {
      sessionOptions.discounts = [{ coupon: resolvedCoupon }];
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    await trackBusinessEvent("checkout_session_created", user.id, {
      price_id: priceId,
      coupon: resolvedCoupon,
      promo_code: promoCode || null,
      founders_slot_reserved: foundersSlotReserved,
      session_id: session.id,
    });

    return new Response(
      JSON.stringify({ url: session.url, applied_coupon: resolvedCoupon }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("Checkout error:", error);
    const message = error instanceof Error ? error.message : "Failed to create checkout session";
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
