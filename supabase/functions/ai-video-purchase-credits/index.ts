import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PurchaseRequest {
  packId: 'starter' | 'standard' | 'pro' | 'enterprise';
  currency: 'EUR' | 'USD';
}

// Credit packs by currency
const CREDIT_PACKS = {
  EUR: {
    starter: { price: 10.00, bonus: 0, bonusPercent: 0 },
    standard: { price: 50.00, bonus: 1.00, bonusPercent: 2 },
    pro: { price: 100.00, bonus: 6.00, bonusPercent: 6 },
    enterprise: { price: 250.00, bonus: 37.50, bonusPercent: 15 },
  },
  USD: {
    starter: { price: 10.00, bonus: 0, bonusPercent: 0 },
    standard: { price: 50.00, bonus: 1.00, bonusPercent: 2 },
    pro: { price: 100.00, bonus: 6.00, bonusPercent: 6 },
    enterprise: { price: 250.00, bonus: 37.50, bonusPercent: 15 },
  }
};

// Stripe Price IDs mapping
const STRIPE_PRICE_IDS = {
  starter: {
    EUR: 'price_1SWOEBDRu4kfSFxjUBaTMzcY', // Deutsch - 10€
    USD: 'price_1SWOLXDRu4kfSFxjB2f0WitH'  // English - $10
  },
  standard: {
    EUR: 'price_1SWOFXDRu4kfSFxjX6amIvWL', // Deutsch - 50€
    USD: 'price_1SWOO5DRu4kfSFxj9t8ulY5g'  // English - $50
  },
  pro: {
    EUR: 'price_1SWOHkDRu4kfSFxjxURoJ2JP', // Deutsch - 100€
    USD: 'price_1SWOPVDRu4kfSFxjhkMo0rqI'  // English - $100
  },
  enterprise: {
    EUR: 'price_1SWOJGDRu4kfSFxj03qDB5Fj', // Deutsch - 250€
    USD: 'price_1SWOQbDRu4kfSFxjPWv0qH9u'  // English - $250
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Check user plan (Pro or Enterprise only)
    const { data: wallet, error: walletError } = await supabaseClient
      .from('wallets')
      .select('plan_code')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      throw new Error("User wallet not found");
    }

    if (!['pro', 'enterprise'].includes(wallet.plan_code)) {
      return new Response(
        JSON.stringify({ error: "AI Video Generation requires Pro or Enterprise plan" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request with currency
    const { packId, currency } = await req.json() as PurchaseRequest;
    const pack = CREDIT_PACKS[currency][packId];
    const priceId = STRIPE_PRICE_IDS[packId][currency];

    if (!pack) {
      throw new Error("Invalid pack ID or currency");
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
    let customerId: string;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({ email: user.email! });
      customerId = customer.id;
    }

    // Create Checkout Session using Stripe Price ID
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      currency: currency.toLowerCase(),
      success_url: `${req.headers.get("origin")}/ai-video-studio?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/ai-video-studio?payment=canceled`,
      metadata: {
        user_id: user.id,
        pack_id: packId,
        currency: currency,
        base_amount: pack.price.toString(),
        bonus_amount: pack.bonus.toString(),
        bonus_percent: pack.bonusPercent.toString(),
      },
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error creating purchase session:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
