import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * cache-invalidator
 * 
 * Cron job (every 1h): Removes expired AI cache entries and old cache stats.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data, error } = await supabase.rpc("cleanup_expired_ai_cache");

    if (error) {
      console.error("[cache-invalidator] Error:", error);
      throw error;
    }

    const deleted = data ?? 0;
    console.log(`[cache-invalidator] Removed ${deleted} expired entries`);

    return new Response(
      JSON.stringify({ success: true, deleted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[cache-invalidator] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
