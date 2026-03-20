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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const email = 'denkandreas@web.de';
    const password = 'denkandreas123';

    // 1. Create user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) throw new Error(`Create user failed: ${createError.message}`);
    const userId = newUser.user.id;
    console.log(`User created: ${userId}`);

    // 2. Wait for triggers to fire
    await new Promise(r => setTimeout(r, 2000));

    // 3. Update profile to enterprise
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ plan: 'enterprise' })
      .eq('id', userId);
    if (profileErr) console.error('Profile update error:', profileErr);

    // 4. Update wallet to enterprise
    const { error: walletErr } = await supabase
      .from('wallets')
      .update({ plan_code: 'enterprise', monthly_credits: 999999999, balance: 999999999 })
      .eq('user_id', userId);
    if (walletErr) console.error('Wallet update error:', walletErr);

    // 5. Create AI Video wallet with $50
    const { error: aiWalletErr } = await supabase
      .from('ai_video_wallets')
      .insert({
        user_id: userId,
        balance_euros: 50,
        total_purchased_euros: 50,
        total_spent_euros: 0,
        currency: 'USD',
      });
    if (aiWalletErr) console.error('AI Video wallet error:', aiWalletErr);

    return new Response(JSON.stringify({
      success: true,
      userId,
      email,
      plan: 'enterprise',
      aiVideoBalance: 50,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
