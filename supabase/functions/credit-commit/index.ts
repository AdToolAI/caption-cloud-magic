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

    const { reservation_id, actual_cost } = await req.json();

    if (!reservation_id) {
      return new Response(JSON.stringify({ error: 'reservation_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[COMMIT] User ${user.id} committing reservation: ${reservation_id}`);

    // Get reservation
    const { data: reservation, error: reserveError } = await supabaseClient
      .from('credit_reservations')
      .select('*')
      .eq('id', reservation_id)
      .eq('user_id', user.id)
      .single();

    if (reserveError || !reservation) {
      console.error('Reservation not found:', reserveError);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Reservation not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (reservation.status !== 'reserved') {
      console.error('Invalid reservation status:', reservation.status);
      return new Response(JSON.stringify({ 
        success: false,
        error: `Reservation already ${reservation.status}`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enterprise plan - skip credit deduction
    if (reservation.metadata && reservation.metadata.enterprise_unlimited === true) {
      console.log(`[COMMIT] Enterprise user - skipping credit deduction`);

      // Update reservation status only, no credit deduction
      const { error: updateError } = await supabaseClient
        .from('credit_reservations')
        .update({
          status: 'committed',
          actual_amount: 0,
          committed_at: new Date().toISOString()
        })
        .eq('id', reservation_id);

      if (updateError) {
        console.error('Reservation update error:', updateError);
      }

      console.log(`[COMMIT] Enterprise - no credits charged`);

      return new Response(JSON.stringify({
        success: true,
        charged_amount: 0,
        refunded_amount: 0,
        enterprise_unlimited: true
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const finalCost = actual_cost || reservation.reserved_amount;
    const refundAmount = reservation.reserved_amount - finalCost;

    console.log(`[COMMIT] Reserved: ${reservation.reserved_amount}, Final: ${finalCost}, Refund: ${refundAmount}`);

    // Atomic credit deduction using RPC function
    const { data: deductResult, error: deductError } = await supabaseClient
      .rpc('deduct_credits', { 
        p_user_id: user.id, 
        p_amount: finalCost 
      });

    if (deductError || !deductResult || deductResult.length === 0 || !deductResult[0].success) {
      console.error('Credit deduction failed:', deductError);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Insufficient credits or wallet not found'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newBalance = deductResult[0].new_balance;
    console.log(`[COMMIT] Credits deducted successfully. New balance: ${newBalance}`);

    // Create transaction in user_credit_transactions table
    const { error: txError } = await supabaseClient
      .from('user_credit_transactions')
      .insert({
        user_id: user.id,
        amount: -finalCost,
        transaction_type: 'debit',
        feature_code: reservation.feature_code,
        reservation_id: reservation.id,
        metadata: reservation.metadata
      });

    if (txError) {
      console.error('Transaction creation error:', txError);
    }

    // Update reservation status
    const { error: updateError } = await supabaseClient
      .from('credit_reservations')
      .update({
        status: 'committed',
        actual_amount: finalCost,
        committed_at: new Date().toISOString()
      })
      .eq('id', reservation_id);

    if (updateError) {
      console.error('Reservation update error:', updateError);
    }

    console.log(`[COMMIT] Successfully committed ${finalCost} credits`);

    return new Response(JSON.stringify({
      success: true,
      charged_amount: finalCost,
      refunded_amount: refundAmount
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Commit error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
