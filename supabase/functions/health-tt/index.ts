import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { status: "healthy", provider: "tiktok" });
  }


  try {
    console.log('[HEALTH-TT] Health check requested');
    
    const requiredEnvVars = ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !Deno.env.get(varName));
    
    if (missingVars.length > 0) {
      console.warn('[HEALTH-TT] Missing env vars:', missingVars);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          service: 'tiktok',
          message: 'Missing configuration',
          missing: missingVars 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503 
        }
      );
    }
    
    console.log('[HEALTH-TT] All required env vars present');
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        service: 'tiktok',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('[HEALTH-TT] Error:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        service: 'tiktok',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
