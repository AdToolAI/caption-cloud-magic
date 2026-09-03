import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { FOUNDERS_CREDIT_COUPON } from "../_shared/stripe-config.ts";
import { tl, withLang } from "../_shared/i18n.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
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
    EUR: 'price_1TzLPV1xgyPAUyx6NqoJ9nIK', // Deutsch - 10€
    USD: 'price_1TzLRH1xgyPAUyx6q00iYt0M'  // English - $10
  },
  standard: {
    EUR: 'price_1TzLQ11xgyPAUyx6orEA7320', // Deutsch - 50€
    USD: 'price_1TzLRv1xgyPAUyx6b903vSQ8'  // English - $50
  },
  pro: {
    EUR: 'price_1TzLQZ1xgyPAUyx6L7pojKRa', // Deutsch - 100€
    USD: 'price_1TzLSF1xgyPAUyx6Lu2s3dz2'  // English - $100
  },
  enterprise: {
    EUR: 'price_1TzLQp1xgyPAUyx6iF7LIwKm', // Deutsch - 250€
    USD: 'price_1TzLSe1xgyPAUyx6rcWxqFo2'  // English - $250
  }
};

serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "ai-video-purchase-credits" });


  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false
        }
      }
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Check user plan (Pro or Enterprise only)
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error("Profile lookup failed", { userId: user.id, profileError });
      throw new Error("User profile not found");
    }

    // Beta: unified plan gating — any paid tier (basic/pro/enterprise) qualifies
    if (!['basic', 'pro', 'enterprise'].includes(profile.plan)) {
      return new Response(
        JSON.stringify({ error: "AI Video Generation requires an active Beta-Basic subscription" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Founders 20% discount (24 months from claim, forfeits on account deletion/subscription cancel)
    let isFounder = false;
    try {
      const { data: founderRes } = await supabaseClient.rpc('is_founder_active', { _user_id: user.id });
      isFounder = !!founderRes;
    } catch (e) {
      console.warn("[ai-video-purchase-credits] founder check failed", e);
    }

    // Parse request with currency — beides hart validieren, sonst 500 statt 400.
    const body = await req.json() as Partial<PurchaseRequest> & { locale?: string };
    const packId = body.packId as PurchaseRequest['packId'];
    const currency = body.currency as PurchaseRequest['currency'];
    const checkoutLocale: 'en' | 'de' | 'es' =
      body.locale === 'de' ? 'de' : body.locale === 'es' ? 'es' : 'en';

    const validCurrency = currency === 'EUR' || currency === 'USD';
    const validPack = !!packId && ['starter', 'standard', 'pro', 'enterprise'].includes(packId);
    if (!validCurrency || !validPack) {
      return new Response(
        JSON.stringify({ error: 'Invalid pack ID or currency' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const pack = CREDIT_PACKS[currency][packId];
    const priceId = STRIPE_PRICE_IDS[packId][currency];


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

    // Apply 19% German VAT only for EUR purchases (DE tax law)
    const TAX_RATE_ID = Deno.env.get("STRIPE_TAX_RATE_19_PCT");
    const applyTaxRate = currency === 'EUR' && TAX_RATE_ID;

    // Create Checkout Session using Stripe Price ID
    // invoice_creation forces a full PDF invoice with VAT breakdown (instead of a basic receipt)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
          tax_rates: applyTaxRate ? [TAX_RATE_ID] : undefined,
        },
      ],
      mode: 'payment',
      locale: checkoutLocale,
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      currency: currency.toLowerCase(),
      allow_promotion_codes: !isFounder,
      discounts: isFounder ? [{ coupon: FOUNDERS_CREDIT_COUPON }] : undefined,
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `AI Video Credits - ${packId.charAt(0).toUpperCase() + packId.slice(1)} Pack${isFounder ? ' (Founders -20%)' : ''}`,
          metadata: {
            user_id: user.id,
            pack_id: packId,
            type: 'ai_video_credits',
            founders_discount: isFounder ? 'true' : 'false',
          },
          footer: currency === 'EUR' 
            ? tl({ de: 'Alle Preise inkl. 19% MwSt. (Deutschland). Vielen Dank für Ihren Einkauf.', en: 'All prices include 19% VAT (Germany). Thank you for your purchase.', es: 'Todos los precios incluyen el 19% de IVA (Alemania). Gracias por tu compra.' })
            : 'Thank you for your purchase.',
        },
      },
      success_url: `${req.headers.get("origin")}/ai-video-studio?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/ai-video-studio?payment=canceled`,
      metadata: {
        user_id: user.id,
        pack_id: packId,
        currency: currency,
        base_amount: pack.price.toString(),
        bonus_amount: pack.bonus.toString(),
        bonus_percent: pack.bonusPercent.toString(),
        founders_discount: isFounder ? '20' : '0',
        type: 'ai_video_credits',
      },
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id, foundersDiscount: isFounder }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error creating purchase session:", error);
    const isStripeMethodError = error instanceof Error &&
      /payment_method|payment method|not available|not supported|currency/i.test(error.message);
    const status = isStripeMethodError ? 400 : 500;
    const message = isStripeMethodError
      ? tl({
          de: 'Die gewählte Zahlungsart ist für diese Währung oder Region nicht verfügbar. Bitte versuche es mit einer anderen Methode.',
          en: 'The selected payment method is not available for this currency or region. Please try another method.',
          es: 'El método de pago seleccionado no está disponible para esta moneda o región. Por favor, prueba con otro método.'
        })
      : (error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status }
    );
  }
})(req)));
