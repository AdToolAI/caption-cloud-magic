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

    const { reservation_id, reason } = await req.json();

    if (!reservation_id) {
      return new Response(JSON.stringify({ error: 'reservation_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[REFUND] User ${user.id} refunding reservation: ${reservation_id}, reason: ${reason}`);

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

    // Update reservation status
    const { error: updateError } = await supabaseClient
      .from('credit_reservations')
      .update({
        status: 'refunded',
        committed_at: new Date().toISOString()
      })
      .eq('id', reservation_id);

    if (updateError) {
      console.error('Reservation update error:', updateError);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to update reservation'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create refund transaction with actual amount
    const { error: txError } = await supabaseClient
      .from('user_credit_transactions')
      .insert({
        user_id: user.id,
        amount: reservation.reserved_amount, // Actual refunded amount
        transaction_type: 'refund',
        feature_code: reservation.feature_code,
        reservation_id: reservation.id,
        metadata: { 
          ...reservation.metadata,
          refund_reason: reason || 'Operation cancelled'
        }
      });

    if (txError) {
      console.error('Transaction creation error:', txError);
    }

    // Increment wallet balance using atomic function
    const { error: balanceError } = await supabaseClient.rpc('increment_balance', {
      p_user_id: user.id,
      p_amount: reservation.reserved_amount
    });

    if (balanceError) {
      console.error('Balance increment error:', balanceError);
    }

    console.log(`[REFUND] Successfully refunded reservation ${reservation_id}`);

    return new Response(JSON.stringify({
      success: true,
      refunded_amount: reservation.reserved_amount
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Refund error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
