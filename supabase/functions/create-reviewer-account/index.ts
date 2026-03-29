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

    const reviewerEmail = 'meta-reviewer@useadtool.ai';
    const reviewerPassword = 'MetaReview2026!Secure';

    // 1. Create the user
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email: reviewerEmail,
      password: reviewerPassword,
      email_confirm: true,
    });

    if (createError) throw createError;
    const userId = userData.user.id;

    // 2. Update profile to enterprise
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ plan: 'enterprise' })
      .eq('id', userId);

    if (profileError) throw profileError;

    // 3. Update wallet to enterprise with max credits
    const { error: walletError } = await supabase
      .from('wallets')
      .update({
        plan_code: 'enterprise',
        monthly_credits: 999999999,
        balance: 999999999,
      })
      .eq('user_id', userId);

    if (walletError) throw walletError;

    // 4. Create AI video wallet with 100€
    const { error: videoWalletError } = await supabase
      .from('ai_video_wallets')
      .upsert({
        user_id: userId,
        balance_euros: 100,
        total_purchased_euros: 100,
        total_spent_euros: 0,
        currency: 'EUR',
      }, { onConflict: 'user_id' });

    if (videoWalletError) throw videoWalletError;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Meta reviewer account created successfully!',
        userId,
        email: reviewerEmail,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating reviewer account:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
