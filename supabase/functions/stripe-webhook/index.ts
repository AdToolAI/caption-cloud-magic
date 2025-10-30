import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getPlanFromProductId = (productId: string): string => {
  // Product IDs from pricing config (AdTool AI)
  if (productId === 'prod_TIRSoTyzmRpbpT') return 'basic';
  if (productId === 'prod_TIRWOmhxlzFCwW') return 'pro';
  if (productId === 'prod_TIRYBu4fdR2BEw') return 'enterprise';
  // Enterprise Seat Add-on (internal use only)
  if (productId === 'prod_TIRbm7xCLAPWx3') return 'enterprise';
  return 'free';
};

const getCreditsForPlan = (plan: string): number => {
  switch (plan) {
    case 'basic': return 800;  // Updated for Pricing v2.1
    case 'pro': return 2500;   // Updated for Pricing v2.1
    case 'enterprise': return 999999999; // Unlimited represented as very large number
    default: return 100;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'No signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    
    if (!stripeKey || !webhookSecret) {
      console.error('Missing Stripe configuration');
      return new Response(JSON.stringify({ error: 'Configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    console.log('[STRIPE-WEBHOOK] Event type:', event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;
      
      console.log('[STRIPE-WEBHOOK] Processing checkout session:', { customerId, sessionId: session.id });

      // Get subscription from the session
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const productId = subscription.items.data[0]?.price.product as string;
        const plan = getPlanFromProductId(productId);
        const credits = getCreditsForPlan(plan);

        console.log('[STRIPE-WEBHOOK] Subscription found:', { productId, plan, credits });

        // Find user by customer email
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const email = customer.email;

        if (!email) {
          console.error('[STRIPE-WEBHOOK] No email found for customer');
          return new Response(JSON.stringify({ error: 'No email' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get user by email
        const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
        const user = users?.find(u => u.email === email);

        if (!user) {
          console.error('[STRIPE-WEBHOOK] User not found for email:', email);
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('[STRIPE-WEBHOOK] Updating user from checkout:', user.id);

        // Update profiles.plan
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({ plan })
          .eq('id', user.id);

        if (profileError) {
          console.error('[STRIPE-WEBHOOK] Profile update error:', profileError);
        }

        // Update wallets
        const { error: walletError } = await supabaseAdmin
          .from('wallets')
          .update({ 
            plan_code: plan,
            monthly_credits: credits,
            balance: credits,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        if (walletError) {
          console.error('[STRIPE-WEBHOOK] Wallet update error:', walletError);
          return new Response(JSON.stringify({ error: 'Failed to update wallet' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('[STRIPE-WEBHOOK] Successfully updated plan from checkout to:', plan, 'with', credits, 'credits');
        
        // Track referral if promo code was used
        if (session.promotion_code) {
          try {
            const promoCodeId = typeof session.promotion_code === 'string' 
              ? session.promotion_code 
              : session.promotion_code.id;
            
            const promoCode = await stripe.promotionCodes.retrieve(promoCodeId);
            
            // Check if this is an affiliate promo code
            const { data: promoCodeData } = await supabaseAdmin
              .from('promo_codes')
              .select('id, affiliate_id, code, redemptions_count')
              .eq('stripe_promo_id', promoCode.id)
              .single();
            
            if (promoCodeData?.affiliate_id) {
              console.log(`[STRIPE-WEBHOOK] Creating referral for affiliate ${promoCodeData.affiliate_id}`);
              
              // Create referral record
              await supabaseAdmin.from('referrals').insert({
                affiliate_id: promoCodeData.affiliate_id,
                customer_id: customerId,
                subscription_id: session.subscription,
                promo_code_id: promoCodeData.id,
                status: 'active'
              });
              
              // Increment redemption count
              await supabaseAdmin
                .from('promo_codes')
                .update({ redemptions_count: (promoCodeData.redemptions_count || 0) + 1 })
                .eq('id', promoCodeData.id);
              
              console.log(`[STRIPE-WEBHOOK] Referral created successfully`);
            }
          } catch (referralError) {
            console.error('[STRIPE-WEBHOOK] Error creating referral:', referralError);
            // Don't fail the webhook if referral tracking fails
          }
        }
      }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const productId = subscription.items.data[0]?.price.product as string;
      const plan = getPlanFromProductId(productId);
      const credits = getCreditsForPlan(plan);

      console.log('[STRIPE-WEBHOOK] Processing subscription:', { customerId, productId, plan, credits, eventType: event.type });

      // Handle workspace-level Enterprise subscriptions
      if (subscription.metadata?.workspace_id) {
        const workspaceId = subscription.metadata.workspace_id;
        const currency = subscription.metadata?.currency || "EUR";
        const quantity = subscription.items.data[0]?.quantity || 1;
        
        console.log('[STRIPE-WEBHOOK] Enterprise workspace subscription:', { workspaceId, quantity, currency });
        
        // Update workspace
        await supabaseAdmin
          .from("workspaces")
          .update({
            is_enterprise: true,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            member_currency: currency,
            max_members: quantity,
          })
          .eq("id", workspaceId);

        // Create or update workspace subscription record
        await supabaseAdmin
          .from("workspace_subscriptions")
          .upsert({
            workspace_id: workspaceId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: customerId,
            status: subscription.status,
            plan_type: "enterprise",
            base_seats: 1,
            additional_seats: Math.max(quantity - 1, 0),
            total_amount: subscription.items.data[0]?.price?.unit_amount ? 
              (subscription.items.data[0].price.unit_amount / 100) * quantity : 49.99,
            currency: currency,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          });

        console.log('[STRIPE-WEBHOOK] Enterprise subscription updated for workspace:', workspaceId);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find user by customer email
      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      const email = customer.email;

      if (!email) {
        console.error('[STRIPE-WEBHOOK] No email found for customer');
        return new Response(JSON.stringify({ error: 'No email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get user by email
      const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.find(u => u.email === email);

      if (!user) {
        console.error('[STRIPE-WEBHOOK] User not found for email:', email);
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[STRIPE-WEBHOOK] Updating user:', user.id);

      // Update profiles.plan
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ plan })
        .eq('id', user.id);

      if (profileError) {
        console.error('[STRIPE-WEBHOOK] Profile update error:', profileError);
      }

      // Update wallets: plan_code, monthly_credits, and immediately grant new balance
      // Note: We don't update last_reset_at here to allow users full credit period until next monthly reset
      const { error: walletError } = await supabaseAdmin
        .from('wallets')
        .update({ 
          plan_code: plan,
          monthly_credits: credits,
          balance: credits, // Immediately grant full credits on plan change/creation
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (walletError) {
        console.error('[STRIPE-WEBHOOK] Wallet update error:', walletError);
        return new Response(JSON.stringify({ error: 'Failed to update wallet' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[STRIPE-WEBHOOK] Successfully updated plan to:', plan, 'with', credits, 'credits');
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      console.log('[STRIPE-WEBHOOK] Processing subscription deletion:', { customerId });

      // Handle workspace-level subscription cancellation
      if (subscription.metadata?.workspace_id) {
        const workspaceId = subscription.metadata.workspace_id;
        
        console.log('[STRIPE-WEBHOOK] Cancelling enterprise workspace subscription:', workspaceId);
        
        // Downgrade workspace
        await supabaseAdmin
          .from("workspaces")
          .update({
            is_enterprise: false,
            stripe_subscription_id: null,
            max_members: 1,
          })
          .eq("id", workspaceId);

        // Update workspace subscription record
        await supabaseAdmin
          .from("workspace_subscriptions")
          .update({ status: "cancelled" })
          .eq("workspace_id", workspaceId);

        console.log('[STRIPE-WEBHOOK] Enterprise subscription cancelled for workspace:', workspaceId);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      const email = customer.email;

      if (email) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const user = users?.find(u => u.email === email);

        if (user) {
          // Downgrade to free plan
          await supabaseAdmin.from('profiles').update({ plan: 'free' }).eq('id', user.id);
          await supabaseAdmin
            .from('wallets')
            .update({ 
              plan_code: 'free',
              monthly_credits: 100,
              balance: 100,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);

          console.log('[STRIPE-WEBHOOK] Downgraded to free plan:', user.id);
          
          // Mark referral as cancelled if exists
          try {
            await supabaseAdmin
              .from('referrals')
              .update({ status: 'cancelled', ended_at: new Date().toISOString() })
              .eq('subscription_id', subscription.id)
              .eq('status', 'active');
          } catch (error) {
            console.error('[STRIPE-WEBHOOK] Error updating referral status:', error);
          }
        }
      }
    }
    
    // Handle invoice.paid for affiliate commissions
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      console.log('[STRIPE-WEBHOOK] Processing invoice.paid:', invoice.id);
      
      // Check if this invoice has an active referral for commission
      try {
        const { data: referral } = await supabaseAdmin
          .from('referrals')
          .select('id, affiliate_id, started_at')
          .eq('subscription_id', invoice.subscription)
          .eq('status', 'active')
          .single();
        
        if (referral) {
          // Check if referral is still within commission period (12 months)
          const startedAt = new Date(referral.started_at);
          const now = new Date();
          const monthsElapsed = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
          
          if (monthsElapsed < 12) {
            // Calculate commission (20% of paid amount)
            const commissionCents = Math.round(invoice.amount_paid * 0.20);
            
            console.log(`[STRIPE-WEBHOOK] Creating payout for affiliate ${referral.affiliate_id}: ${commissionCents} cents`);
            
            // Create payout record
            await supabaseAdmin.from('payouts').insert({
              affiliate_id: referral.affiliate_id,
              referral_id: referral.id,
              amount_cents: commissionCents,
              currency: invoice.currency.toUpperCase(),
              invoice_id: invoice.id,
              period_start: new Date(invoice.period_start * 1000).toISOString().split('T')[0],
              period_end: new Date(invoice.period_end * 1000).toISOString().split('T')[0],
              status: 'accrued'
            });
            
            console.log(`[STRIPE-WEBHOOK] Payout created successfully`);
          } else {
            console.log(`[STRIPE-WEBHOOK] Referral expired (${monthsElapsed.toFixed(1)} months elapsed)`);
          }
        }
      } catch (commissionError) {
        console.error('[STRIPE-WEBHOOK] Error processing commission:', commissionError);
        // Don't fail the webhook if commission fails
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[STRIPE-WEBHOOK] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
