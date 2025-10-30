import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { priceId, promoCode, applyIntro } = await req.json();
    if (!priceId) {
      throw new Error("Price ID is required");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      throw new Error("Not authenticated");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    console.log(`Creating checkout for user ${user.id} with price ${priceId}, promo: ${promoCode || 'none'}, intro: ${applyIntro || false}`);

    // Check if customer exists in database
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // Validate if customer exists in Stripe, if an ID is stored
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
        console.log(`Using existing customer: ${customerId}`);
      } catch (error) {
        // Customer doesn't exist in Stripe anymore, create a new one
        console.log(`Customer ${customerId} not found in Stripe, will create new one`);
        customerId = null;
      }
    }

    // Create customer if doesn't exist
    if (!customerId) {
      console.log(`Creating new Stripe customer for user ${user.id}`);
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      console.log(`Created new customer: ${customerId}`);

      // Update profile with new customer ID
      await supabaseClient
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Prepare checkout session options
    const sessionOptions: any = {
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${req.headers.get("origin") || Deno.env.get("SITE_URL")}/billing?success=true`,
      cancel_url: `${req.headers.get("origin") || Deno.env.get("SITE_URL")}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
      },
    };

    // Apply promo code if provided
    if (promoCode) {
      console.log(`Applying promo code: ${promoCode}`);
      sessionOptions.discounts = [{ promotion_code: promoCode }];
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create(sessionOptions);

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: 'Failed to create checkout session' }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
