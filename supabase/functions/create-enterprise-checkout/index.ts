import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error("User not authenticated");
    }

    const { workspaceId, currency = "EUR" } = await req.json();

    if (!workspaceId) {
      throw new Error("Workspace ID is required");
    }

    // Verify user is workspace owner
    const { data: membership } = await supabaseClient
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .single();

    if (membership?.role !== "owner") {
      throw new Error("Only workspace owners can upgrade to Enterprise");
    }

    // Get workspace details
    const { data: workspace } = await supabaseClient
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single();

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    if (workspace.is_enterprise) {
      throw new Error("Workspace is already Enterprise");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Determine price ID based on currency
    const priceId = currency === "USD"
      ? Deno.env.get("STRIPE_PRICE_ENTERPRISE_BASE_USD")
      : Deno.env.get("STRIPE_PRICE_ENTERPRISE_BASE_EUR");

    if (!priceId) {
      throw new Error("Enterprise pricing not configured");
    }

    // Create or get Stripe customer
    let customerId = workspace.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email,
        metadata: {
          workspace_id: workspaceId,
          user_id: userData.user.id,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${req.headers.get("origin")}/team?upgrade=success`,
      cancel_url: `${req.headers.get("origin")}/team?upgrade=cancelled`,
      metadata: {
        workspace_id: workspaceId,
        plan_type: "enterprise",
        currency: currency,
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error creating enterprise checkout:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
