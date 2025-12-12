import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Plan to Stripe Price ID mapping (EUR prices)
const PLAN_PRICE_MAP: Record<string, string> = {
  basic: 'price_1SLqZyDRu4kfSFxjfhMnx186',
  pro: 'price_1SLqd6DRu4kfSFxjM1v5wUrp',
  enterprise: 'price_1SLqfFDRu4kfSFxjy2ZxDkby',
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[MIGRATE-TO-STRIPE] ${step}`, details ? JSON.stringify(details) : '');
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");

    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get user's profile to check current plan
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("plan, stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profileError) throw new Error(`Profile not found: ${profileError.message}`);
    
    logStep("Profile loaded", { plan: profile.plan, hasStripeCustomer: !!profile.stripe_customer_id });

    // Check if already has Stripe customer
    if (profile.stripe_customer_id) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Already has Stripe customer",
          customerId: profile.stripe_customer_id 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Check if user has a valid plan
    const plan = profile.plan?.toLowerCase();
    if (!plan || !PLAN_PRICE_MAP[plan]) {
      throw new Error(`Invalid or no plan found: ${plan}`);
    }

    const priceId = PLAN_PRICE_MAP[plan];
    logStep("Plan mapped to price", { plan, priceId });

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer already exists in Stripe by email
    const existingCustomers = await stripe.customers.list({ 
      email: user.email!, 
      limit: 1 
    });

    let customerId: string;

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
      logStep("Found existing Stripe customer", { customerId });
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email!,
        metadata: {
          supabase_user_id: user.id,
          plan: plan,
        },
      });
      customerId = customer.id;
      logStep("Created new Stripe customer", { customerId });
    }

    // Check if customer already has an active subscription
    const existingSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    let subscriptionId: string;

    if (existingSubscriptions.data.length > 0) {
      subscriptionId = existingSubscriptions.data[0].id;
      logStep("Customer already has active subscription", { subscriptionId });
    } else {
      // Create subscription for the customer
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          supabase_user_id: user.id,
          migrated_from_manual: 'true',
        },
      });
      subscriptionId = subscription.id;
      logStep("Created subscription", { subscriptionId, status: subscription.status });
    }

    // Update profile with stripe_customer_id
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);

    if (updateError) {
      logStep("Warning: Failed to update profile", { error: updateError.message });
    } else {
      logStep("Profile updated with stripe_customer_id");
    }

    return new Response(
      JSON.stringify({
        success: true,
        customerId,
        subscriptionId,
        message: "Successfully migrated to Stripe billing",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
