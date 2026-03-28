import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Create user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'rodger@dusatko.com',
      password: 'Wonderful01$',
      email_confirm: true,
    });

    if (authError) throw new Error(`Auth error: ${authError.message}`);
    const userId = authData.user.id;
    console.log('User created:', userId);

    // 2. Update profile to enterprise
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ plan: 'enterprise' })
      .eq('id', userId);
    if (profileError) console.warn('Profile update:', profileError.message);

    // 3. Update wallet to enterprise
    const { error: walletError } = await supabase
      .from('wallets')
      .update({
        plan_code: 'enterprise',
        monthly_credits: 999999999,
        balance: 999999999,
      })
      .eq('user_id', userId);
    if (walletError) console.warn('Wallet update:', walletError.message);

    // 4. Create AI Video Wallet with $100
    const { error: aiWalletError } = await supabase
      .from('ai_video_wallets')
      .upsert({
        user_id: userId,
        balance_euros: 100,
        total_purchased_euros: 100,
        total_spent_euros: 0,
        currency: 'EUR',
      }, { onConflict: 'user_id' });
    if (aiWalletError) console.warn('AI Wallet:', aiWalletError.message);

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        message: 'Account rodger@dusatko.com created with Enterprise + $100 AI credits',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
