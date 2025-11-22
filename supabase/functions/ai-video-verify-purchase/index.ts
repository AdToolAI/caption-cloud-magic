import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Retrieve session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new Error("Payment not completed");
    }

    // Get metadata including currency
    const { user_id, pack_id, currency, base_amount, bonus_amount, bonus_percent } = session.metadata!;

    // Use service role to add credits
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Call database function to add credits with currency
    const { data, error } = await supabaseAdmin.rpc('add_ai_video_credits', {
      p_user_id: user_id,
      p_currency: currency,
      p_base_amount: parseFloat(base_amount),
      p_bonus_amount: parseFloat(bonus_amount),
      p_pack_size: pack_id,
      p_bonus_percent: parseInt(bonus_percent),
      p_stripe_session_id: sessionId,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, newBalance: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error verifying purchase:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
