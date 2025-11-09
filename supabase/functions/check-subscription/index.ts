import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { withTelemetry } from "../_shared/telemetry.ts";
import { getSupabaseClient } from '../_shared/db-client.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(withTelemetry("check-subscription", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = getSupabaseClient(false); // Use anon key

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ subscribed: false }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("stripe_customer_id, test_mode_plan")
      .eq("id", user.id)
      .single();

    // Check for test mode first
    if (profile?.test_mode_plan) {
      const testProductId = profile.test_mode_plan === 'pro' 
        ? 'prod_TDoYdYP1nOOWsN' 
        : profile.test_mode_plan === 'basic' 
        ? 'prod_TDoWFAZjKKUnA2' 
        : null;
      
      return new Response(
        JSON.stringify({
          subscribed: profile.test_mode_plan !== 'free',
          product_id: testProductId,
          subscription_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          test_mode: true,
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Check if user has a plan set in profiles (for non-Stripe enterprise users)
    if (profile?.test_mode_plan === null || profile?.test_mode_plan === undefined) {
      const { data: profilePlan } = await supabaseClient
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .single();

      if (profilePlan?.plan && profilePlan.plan !== 'free') {
        // Map plan to product ID
        const planToProductId: Record<string, string> = {
          'basic': 'prod_TIRSoTyzmRpbpT',
          'pro': 'prod_TIRWOmhxlzFCwW', 
          'enterprise': 'prod_TIRYBu4fdR2BEw'
        };
        
        return new Response(
          JSON.stringify({
            subscribed: true,
            product_id: planToProductId[profilePlan.plan] || null,
            subscription_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            plan_based: true
          }),
          { 
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }
    }

    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ subscribed: false }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      limit: 1,
    });

    const hasActiveSubscription = subscriptions.data.length > 0;
    const subscription = subscriptions.data[0];

    const productId = hasActiveSubscription && subscription?.items?.data?.[0]?.price?.product 
      ? subscription.items.data[0].price.product 
      : null;
    const subscriptionEnd = hasActiveSubscription && subscription?.current_period_end 
      ? new Date(subscription.current_period_end * 1000).toISOString() 
      : null;

    return new Response(
      JSON.stringify({
        subscribed: hasActiveSubscription,
        product_id: productId,
        subscription_end: subscriptionEnd,
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: 'Failed to check subscription' }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}));
