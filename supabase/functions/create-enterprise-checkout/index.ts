import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { tl, withLang } from "../_shared/i18n.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "create-enterprise-checkout" });


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

    const body = await req.json();
    const { workspaceId, currency = "EUR", locale } = body;
    const checkoutLocale: "en" | "de" | "es" =
      locale === "de" ? "de" : locale === "es" ? "es" : "en";

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
      apiVersion: "2025-08-27.basil",
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
      locale: checkoutLocale,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // Aktive Methoden im Stripe-Dashboard: Card, PayPal, Link, SEPA, Klarna, iDEAL, etc.
      // Apple Pay & Google Pay laufen automatisch über 'card' (Domain verifiziert).
      // Zahlungsarten kommen aus den Stripe-Dashboard-Einstellungen (automatic payment methods).
      // Hartes Setzen von "paypal" ließ den Checkout mit 500 fehlschlagen, wenn die Methode
      // für Währung/Land nicht aktiviert ist.
      // Sammle Rechnungsadresse + Name, damit Stripe-Rechnungen korrekt ausgestellt werden
      // und SEPA-/PayPal-Mandate für wiederkehrende Zahlungen sauber angelegt werden.
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      subscription_data: {
        description: "AdTool AI Enterprise Subscription",
        metadata: {
          workspace_id: workspaceId,
          user_id: userData.user.id,
        },
      },
      success_url: `${req.headers.get("origin")}/team-workspace?upgrade=success`,
      cancel_url: `${req.headers.get("origin")}/team-workspace?upgrade=cancelled`,
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
