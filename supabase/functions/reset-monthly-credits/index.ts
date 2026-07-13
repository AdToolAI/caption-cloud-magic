import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSupabaseClient } from "../_shared/db-client.ts";
import { authenticateInternalRequest } from "../_shared/internal-auth.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "reset-monthly-credits" });


  const auth = await authenticateInternalRequest(req, { corsHeaders });
  if (!auth.ok) return auth.response;
  if (!auth.isService) {
    return new Response(JSON.stringify({ error: 'Forbidden: service role required' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseClient = getSupabaseClient();

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
