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

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ invoices: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Validate if stored customer ID still exists in Stripe
    try {
      await stripe.customers.retrieve(profile.stripe_customer_id);
    } catch (error: any) {
      if (error.code === 'resource_missing' || error.statusCode === 404) {
        console.log(`[Get-Invoices] Stripe customer not found: ${profile.stripe_customer_id}`);
        // Customer doesn't exist - return empty invoices
        return new Response(
          JSON.stringify({ invoices: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
      throw error;
    }

    const invoices = await stripe.invoices.list({
      customer: profile.stripe_customer_id,
      limit: 20,
    });

    const formattedInvoices = invoices.data.map((invoice: any) => ({
      id: invoice.id,
      number: invoice.number,
      date: invoice.created * 1000,
      amount: (invoice.amount_paid || 0) / 100,
      currency: invoice.currency || "eur",
      status: invoice.status,
      hosted_invoice_url: invoice.hosted_invoice_url,
      pdf: invoice.invoice_pdf,
    }));

    return new Response(
      JSON.stringify({ invoices: formattedInvoices }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve invoices' }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});