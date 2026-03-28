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

    const { userEmail } = await req.json();

    const allowedEmails = ['bestofproducts4u@gmail.com', 'dusatkojr@web.de', 'denkandreas@web.de', 'rodger@dusatko.com'];
    if (!allowedEmails.includes(userEmail)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (profileError || !profile) {
      throw new Error('User not found');
    }

    // Update profiles table
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({ plan: 'enterprise' })
      .eq('email', userEmail);

    if (updateProfileError) throw updateProfileError;

    // Update wallets table
    const { error: updateWalletError } = await supabase
      .from('wallets')
      .update({ 
        plan_code: 'enterprise',
        monthly_credits: 999999999,
        balance: 999999999
      })
      .eq('user_id', profile.id);

    if (updateWalletError) throw updateWalletError;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Successfully upgraded to Enterprise plan!',
        plan: 'enterprise',
        credits: 999999999
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error upgrading plan:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
