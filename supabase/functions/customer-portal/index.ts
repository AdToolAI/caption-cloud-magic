import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Plan to Stripe Price ID mapping (EUR prices)
const STRIPE_PRICE_MAP: Record<string, string> = {
  basic: "price_1SLqZyDRu4kfSFxjfhMnx186",      // AdTool AI Basic - 14,95€/Monat
  pro: "price_1SLqd6DRu4kfSFxjM1v5wUrp",        // AdTool AI Pro - 34,95€/Monat
  enterprise: "price_1SLqfFDRu4kfSFxjy2ZxDkby", // AdTool AI Enterprise - 69,95€/Monat
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

    // Use anon client for user auth
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Use service role for database updates
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      throw new Error("Not authenticated");
    }

    // Get user profile with plan info
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, plan")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw new Error("Profile not found");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    let customerId = profile?.stripe_customer_id;

    // Validate if stored customer ID still exists in Stripe
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
        console.log(`[Customer-Portal] Stripe customer validated: ${customerId}`);
      } catch (error: any) {
        if (error.code === 'resource_missing' || error.statusCode === 404) {
          console.log(`[Customer-Portal] Stripe customer not found, resetting: ${customerId}`);
          // Customer doesn't exist in Stripe - reset it
          await supabaseAdmin
            .from("profiles")
            .update({ stripe_customer_id: null })
            .eq("id", user.id);
          customerId = null;
        } else {
          throw error; // Re-throw other errors
        }
      }
    }

    // Auto-migrate: If no Stripe customer but has a plan, create customer + subscription
    if (!customerId && profile?.plan) {
      console.log(`[Auto-Migration] Creating Stripe customer for user ${user.id} with plan ${profile.plan}`);
      
      // Create Stripe Customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
          plan: profile.plan,
        },
      });
      customerId = customer.id;
      console.log(`[Auto-Migration] Created Stripe customer: ${customerId}`);

      // Get the price ID for the plan
      const priceId = STRIPE_PRICE_MAP[profile.plan];
      if (!priceId) {
        throw new Error(`No Stripe price found for plan: ${profile.plan}`);
      }

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        metadata: {
          supabase_user_id: user.id,
          migrated_from_manual: "true",
        },
      });
      console.log(`[Auto-Migration] Created subscription: ${subscription.id}`);

      // Save stripe_customer_id to profile
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);

      if (updateError) {
        console.error("[Auto-Migration] Failed to update profile:", updateError);
        throw new Error("Failed to save Stripe customer ID");
      }
      console.log(`[Auto-Migration] Saved stripe_customer_id to profile`);
    }

    if (!customerId) {
      throw new Error("No Stripe customer found and no plan to migrate");
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.headers.get("origin") || Deno.env.get("SITE_URL")}/billing`,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in customer-portal:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to access customer portal' }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
