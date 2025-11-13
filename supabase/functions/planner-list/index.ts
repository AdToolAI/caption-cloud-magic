import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getRedisCache } from '../_shared/redis-cache.ts';
import { getSupabaseClient } from '../_shared/db-client.ts';

// PostHog tracking (fire-and-forget, non-blocking)
function trackEvent(eventName: string, properties: Record<string, any>): void {
  const posthogKey = Deno.env.get('POSTHOG_API_KEY');
  if (!posthogKey) return;
  
  // Fire-and-forget async tracking (doesn't block request)
  fetch('https://eu.i.posthog.com/capture/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: posthogKey,
      event: eventName,
      properties: {
        ...properties,
        $lib: 'edge-function',
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    }),
  }).catch(error => console.error('[PostHog] Track failed:', error));
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const supabase = getSupabaseClient();

    const { workspace_id, type, source, search, tags, limit = 50, offset = 0 } = await req.json();
    
    console.log('[planner-list] Request:', { workspace_id, type, source, search, tags, limit, offset });

    // Redis Cache Integration (replaces in-memory cache)
    const cache = getRedisCache();
    const cacheKey = cache.generateKeyHash('planner-list', { 
      workspace_id, 
      type, 
      source, 
      search, 
      tags, 
      limit, 
      offset 
    });

    // Check Redis cache first (Phase 3: Extended to 5 minute TTL for better hit rate)
    const cached = await cache.get(cacheKey, { logHits: true });
    if (cached) {
      const duration = Date.now() - startTime;
      
      // Track cache hit
      trackEvent('planner_list.cache_hit', {
        workspace_id,
        query_pattern: { type, source, has_search: !!search, has_tags: !!tags },
        duration_ms: duration,
      });
      
      return new Response(
        JSON.stringify(cached),
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "X-Cache": "REDIS-HIT",
            "X-Response-Time": `${duration}ms`
          } 
        }
      );
    }

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optimized query building for composite indexes
    const queryStartTime = Date.now();
    
    let query = supabase
      .from("content_items")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspace_id);

    // Build query to leverage composite indexes
    // Index usage priority: type+source > type > search > tags
    if (type && source) {
      // Uses idx_content_items_type_source_created
      query = query.eq("type", type).eq("source", source);
    } else if (type) {
      // Uses idx_content_items_type_created
      query = query.eq("type", type);
    }
    
    if (source && !type) {
      query = query.eq("source", source);
    }
    
    if (search) {
      // Uses idx_content_items_title_trgm and idx_content_items_caption_trgm
      query = query.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
    }
    
    if (tags && tags.length > 0) {
      // Uses idx_content_items_tags_gin
      query = query.overlaps("tags", tags);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    const queryDuration = Date.now() - queryStartTime;

    if (error) throw error;

    const result = { items: data, total: count };
    const totalDuration = Date.now() - startTime;

    // Track cache miss with query performance
    trackEvent('planner_list.cache_miss', {
      workspace_id,
      query_pattern: { type, source, has_search: !!search, has_tags: !!tags },
      query_duration_ms: queryDuration,
      total_duration_ms: totalDuration,
      result_count: data?.length || 0,
      total_count: count || 0,
    });

    // Phase 3: Cache for 5 minutes (300 seconds) for better cache hit rate
    await cache.set(cacheKey, result, 300);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-Cache": "REDIS-MISS",
          "X-Query-Time": `${queryDuration}ms`,
          "X-Response-Time": `${totalDuration}ms`
        } 
      }
    );
  } catch (error: any) {
    console.error("Error in planner-list:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
