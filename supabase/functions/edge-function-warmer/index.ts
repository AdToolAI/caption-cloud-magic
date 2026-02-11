const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Critical functions to keep warm - expanded list for performance
const CRITICAL_FUNCTIONS = [
  'check-subscription',
  'planner-list',
  'calendar-timeline-slots',
  'generate-campaign',
  'posting-times-api',
  'sync-social-posts-v2',
  'get-credits',
  'render-with-remotion',
  'generate-caption',
  'generate-hooks',
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[edge-function-warmer] Starting warming cycle...');
    const startTime = Date.now();
    const results: Record<string, string> = {};

    const warmingPromises = CRITICAL_FUNCTIONS.map(async (functionName) => {
      try {
        const warmStart = Date.now();
        
        const response = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/${functionName}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ warmup: true }),
          }
        );

        const warmDuration = Date.now() - warmStart;
        const status = response.ok ? 'OK' : `FAILED (${response.status})`;
        results[functionName] = `${status} (${warmDuration}ms)`;
        
        console.log(`[edge-function-warmer] ${functionName}: ${status} in ${warmDuration}ms`);
      } catch (error: any) {
        results[functionName] = `ERROR: ${error.message}`;
        console.error(`[edge-function-warmer] ${functionName} failed:`, error);
      }
    });

    await Promise.all(warmingPromises);

    const totalDuration = Date.now() - startTime;
    console.log(`[edge-function-warmer] Completed in ${totalDuration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: totalDuration,
        results,
        warmed_count: CRITICAL_FUNCTIONS.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in edge-function-warmer:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
