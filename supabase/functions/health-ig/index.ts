import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[HEALTH-IG] Health check requested');
    
    // Basic health check - verify environment variables are set
    const requiredEnvVars = ['META_APP_ID', 'META_APP_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !Deno.env.get(varName));
    
    if (missingVars.length > 0) {
      console.warn('[HEALTH-IG] Missing env vars:', missingVars);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          service: 'instagram',
          message: 'Missing configuration',
          missing: missingVars 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 503 
        }
      );
    }
    
    console.log('[HEALTH-IG] All required env vars present');
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        service: 'instagram',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('[HEALTH-IG] Error:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        service: 'instagram',
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
