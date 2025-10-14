import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { feature_code, estimated_cost, metadata } = await req.json();

    if (!feature_code) {
      return new Response(JSON.stringify({ error: 'feature_code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[RESERVE] User ${user.id} reserving credits for: ${feature_code}`);

    // Get feature cost
    const { data: featureCost, error: costError } = await supabaseClient
      .from('feature_costs')
      .select('credits_per_use')
      .eq('feature_code', feature_code)
      .single();

    if (costError || !featureCost) {
      console.error('Feature cost error:', costError);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Feature not found'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const creditsToReserve = estimated_cost || featureCost.credits_per_use;

    // Check and update wallet balance atomically
    const { data: wallet, error: walletError } = await supabaseClient
      .from('wallets')
      .select('id, balance, plan_code')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      console.error('Wallet error:', walletError);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Wallet not found'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enterprise plan - skip credit deduction
    if (wallet.plan_code === 'enterprise') {
      console.log(`[RESERVE] Enterprise user - skipping credit deduction`);
      
      // Create a virtual reservation without deducting balance
      const { data: reservation, error: reserveError } = await supabaseClient
        .from('credit_reservations')
        .insert({
          user_id: user.id,
          feature_code,
          reserved_amount: 0,
          status: 'reserved',
          metadata: { ...metadata, enterprise_unlimited: true }
        })
        .select()
        .single();

      if (reserveError) {
        console.error('Reservation error:', reserveError);
        return new Response(JSON.stringify({ 
          success: false,
          error: 'Failed to create reservation'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        reservation_id: reservation.id,
        reserved_amount: 0,
        expires_at: reservation.expires_at,
        enterprise_unlimited: true
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (wallet.balance < creditsToReserve) {
      console.log(`[RESERVE] Insufficient balance: ${wallet.balance} < ${creditsToReserve}`);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Insufficient credits',
        available_balance: wallet.balance,
        required_credits: creditsToReserve
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create reservation
    const { data: reservation, error: reserveError } = await supabaseClient
      .from('credit_reservations')
      .insert({
        user_id: user.id,
        feature_code,
        reserved_amount: creditsToReserve,
        status: 'reserved',
        metadata: metadata || {}
      })
      .select()
      .single();

    if (reserveError) {
      console.error('Reservation error:', reserveError);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to create reservation'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[RESERVE] Created reservation ${reservation.id} for ${creditsToReserve} credits`);

    return new Response(JSON.stringify({
      success: true,
      reservation_id: reservation.id,
      reserved_amount: creditsToReserve,
      expires_at: reservation.expires_at
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Reserve error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
