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
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
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

    const { feature_code, estimated_cost } = await req.json();

    if (!feature_code) {
      return new Response(JSON.stringify({ error: 'feature_code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[PREFLIGHT] User ${user.id} checking feature: ${feature_code}, estimated_cost: ${estimated_cost}`);

    // Get user's wallet
    const { data: wallet, error: walletError } = await supabaseClient
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      console.error('Wallet error:', walletError);
      return new Response(JSON.stringify({ 
        allowed: false, 
        reason: 'Wallet not found',
        available_balance: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get feature cost
    const { data: featureCost, error: costError } = await supabaseClient
      .from('feature_costs')
      .select('credits_per_use')
      .eq('feature_code', feature_code)
      .single();

    if (costError || !featureCost) {
      console.error('Feature cost error:', costError);
      return new Response(JSON.stringify({ 
        allowed: false, 
        reason: 'Feature not found',
        available_balance: wallet.balance
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requiredCredits = estimated_cost || featureCost.credits_per_use;
    const allowed = wallet.balance >= requiredCredits;

    console.log(`[PREFLIGHT] Balance: ${wallet.balance}, Required: ${requiredCredits}, Allowed: ${allowed}`);

    return new Response(JSON.stringify({
      allowed,
      available_balance: wallet.balance,
      required_credits: requiredCredits,
      reason: allowed ? 'Sufficient credits' : 'Insufficient credits'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Preflight error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
