import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { trackBusinessEvent } from "../_shared/telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const FOUNDERS_COUPON = "PRO-FOUNDERS-24M";
const LAUNCH_COUPON = "PRO-LAUNCH-3M";
const FOUNDERS_MAX_SLOTS = 1000;
const PRO_PRICE_IDS = new Set([
  "price_1TSLxWDRu4kfSFxjEJNi8nGN", // Pro €29.99 v2 EUR
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
      apiVersion: "2025-08-27.basil",
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

    if (!resolvedCoupon && !promoCode && PRO_PRICE_IDS.has(priceId)) {
      // Check if user already has a founders/launch slot
      const { data: existing } = await supabaseAdmin
        .from("founders_signups")
        .select("coupon_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        resolvedCoupon = existing.coupon_id;
        console.log(`User already has slot: ${resolvedCoupon}`);
      } else {
        // Count current founders slots
        const { count } = await supabaseAdmin
          .from("founders_signups")
          .select("*", { count: "exact", head: true })
          .eq("coupon_id", FOUNDERS_COUPON);

        const founders = count ?? 0;
        if (founders < FOUNDERS_MAX_SLOTS) {
          resolvedCoupon = FOUNDERS_COUPON;
          // Reserve the slot (subscription_id filled later by webhook if available)
          const { error: insErr } = await supabaseAdmin
            .from("founders_signups")
            .insert({
              user_id: user.id,
              stripe_customer_id: customerId,
              coupon_id: FOUNDERS_COUPON,
            });
          if (!insErr) {
            foundersSlotReserved = true;
            console.log(`Reserved founders slot ${founders + 1}/${FOUNDERS_MAX_SLOTS}`);
            await trackBusinessEvent("founders_slot_claimed", user.id, {
              slot_number: founders + 1,
              max_slots: FOUNDERS_MAX_SLOTS,
              coupon: FOUNDERS_COUPON,
            });
          } else {
            console.warn("Could not reserve founders slot:", insErr.message);
          }
        } else {
          resolvedCoupon = LAUNCH_COUPON;
          await supabaseAdmin.from("founders_signups").insert({
            user_id: user.id,
            stripe_customer_id: customerId,
            coupon_id: LAUNCH_COUPON,
          });
          console.log("Founders sold out, applying launch coupon");
        }
      }
    }

    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      // Aktive Methoden im Stripe-Dashboard: Card, PayPal, Link.
      // Apple Pay & Google Pay laufen automatisch über 'card' (Domain verifiziert).
      // SEPA / Klarna können später hinzugefügt werden, wenn im Dashboard aktiv.
      payment_method_types: ["card", "paypal", "link"],
      // Sammle Rechnungsadresse + Name, damit Stripe-Rechnungen korrekt ausgestellt werden
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      // Stripe sendet die finalisierte Rechnung automatisch per E-Mail an den Kunden
      // (zusätzlich verschicken wir aus dem Webhook eine gebrandete Quittung).
      subscription_data: {
        description: "AdTool AI subscription",
      },
      invoice_creation: undefined, // (für mode=subscription nicht gültig — Subscriptions erzeugen Invoices automatisch)
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
