import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getRedisCache } from '../_shared/redis-cache.ts';
import { getSupabaseClient } from '../_shared/db-client.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Top query patterns to warm cache (based on k6 test patterns)
const WARM_PATTERNS = [
  { type: 'image', source: 'campaign' },
  { type: 'video', source: null },
  { type: 'image', source: null },
  { search: 'test' },
  { tags: ['marketing', 'social'] },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[cache-warming] Starting cache warm-up...');
    const supabase = getSupabaseClient();
    const cache = getRedisCache();
    const startTime = Date.now();
    let warmedCount = 0;
    let errorCount = 0;

    // Get all active workspaces (limit to 10 most active)
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (wsError) throw wsError;

    // Warm cache for each workspace and pattern combination
    for (const workspace of workspaces || []) {
      for (const pattern of WARM_PATTERNS) {
        try {
          const params = {
            workspace_id: workspace.id,
            type: pattern.type || null,
            source: pattern.source || null,
            search: pattern.search || null,
            tags: pattern.tags || null,
            limit: 50,
            offset: 0,
          };

          // Generate cache key (same logic as planner-list)
          const cacheKey = cache.generateKeyHash('planner-list', params);

          // Check if already cached
          const existing = await cache.get(cacheKey);
          if (existing) {
            console.log(`[cache-warming] Skip: ${cacheKey} (already cached)`);
            continue;
          }

          // Build and execute query
          let query = supabase
            .from("content_items")
            .select("*", { count: "exact" })
            .eq("workspace_id", workspace.id);

          if (pattern.type) query = query.eq("type", pattern.type);
          if (pattern.source) query = query.eq("source", pattern.source);
          if (pattern.search) {
            query = query.or(`title.ilike.%${pattern.search}%,caption.ilike.%${pattern.search}%`);
          }
          if (pattern.tags && pattern.tags.length > 0) {
            query = query.overlaps("tags", pattern.tags);
          }

          query = query
            .order("created_at", { ascending: false })
            .range(0, 49);

          const { data, error, count } = await query;

          if (error) {
            console.error(`[cache-warming] Query error for workspace ${workspace.id}:`, error);
            errorCount++;
            continue;
          }

          const result = { items: data, total: count };

          // Cache for 5 minutes (same as planner-list)
          await cache.set(cacheKey, result, 300);
          
          warmedCount++;
          console.log(`[cache-warming] Warmed: ${cacheKey} (${data?.length || 0} items)`);

        } catch (patternError) {
          console.error(`[cache-warming] Pattern error:`, patternError);
          errorCount++;
        }
      }
    }

    const duration = Date.now() - startTime;
    
    console.log(`[cache-warming] Complete: ${warmedCount} cached, ${errorCount} errors in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        warmed_count: warmedCount,
        error_count: errorCount,
        duration_ms: duration,
        workspaces_processed: workspaces?.length || 0,
      }),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );
  } catch (error: any) {
    console.error("[cache-warming] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
