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

    const { workspaceId } = await req.json();

    if (!workspaceId) {
      throw new Error("Workspace ID is required");
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

    if (!workspace.is_enterprise) {
      throw new Error("Workspace is not Enterprise");
    }

    if (!workspace.stripe_subscription_id) {
      throw new Error("No active subscription found");
    }

    // Count accepted members
    const { data: members, count } = await supabaseClient
      .from("workspace_members")
      .select("id", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .eq("status", "accepted");

    const seatCount = Math.max(count || 1, 1);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Get subscription
    const subscription = await stripe.subscriptions.retrieve(workspace.stripe_subscription_id);

    // Find the seat item (it should be the first one for base plan)
    const subscriptionItemId = subscription.items.data[0]?.id;

    if (!subscriptionItemId) {
      throw new Error("Subscription item not found");
    }

    // Update subscription quantity
    await stripe.subscriptions.update(workspace.stripe_subscription_id, {
      items: [
        {
          id: subscriptionItemId,
          quantity: seatCount,
        },
      ],
      proration_behavior: "always_invoice",
    });

    // Update workspace seat count
    await supabaseClient
      .from("workspaces")
      .update({ max_members: seatCount })
      .eq("id", workspaceId);

    console.log(`Updated seats for workspace ${workspaceId}: ${seatCount} seats`);

    return new Response(
      JSON.stringify({ success: true, seatCount }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error updating workspace seats:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
