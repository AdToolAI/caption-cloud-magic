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

    const finalCost = actual_cost || reservation.reserved_amount;
    const refundAmount = reservation.reserved_amount - finalCost;

    console.log(`[COMMIT] Reserved: ${reservation.reserved_amount}, Final: ${finalCost}, Refund: ${refundAmount}`);

    // Update wallet balance
    const { error: walletError } = await supabaseClient.rpc('increment', {
      row_id: user.id,
      x: -finalCost
    });

    if (walletError) {
      console.error('Wallet update error:', walletError);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to update wallet'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create transaction
    const { error: txError } = await supabaseClient
      .from('credit_transactions')
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
