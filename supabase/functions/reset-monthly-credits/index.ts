import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  try {
    console.log('[RESET-MONTHLY-CREDITS] Starting monthly credit reset...');

    // Calculate cutoff date (1 month ago)
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 1);
    
    console.log('[RESET-MONTHLY-CREDITS] Cutoff date:', cutoffDate.toISOString());

    // Reset all wallets that haven't been reset in the last month
    const { data, error } = await supabaseClient.rpc('reset_monthly_credits');

    if (error) {
      console.error('[RESET-MONTHLY-CREDITS] Error:', error);
      throw error;
    }

    console.log('[RESET-MONTHLY-CREDITS] Successfully reset wallets');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Monthly credits reset completed',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[RESET-MONTHLY-CREDITS] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
