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
    console.log('[planner-list] Version: Phase3.1-Fix (2025-11-13)');
    const startTime = Date.now();
    const supabase = getSupabaseClient();

    const { workspace_id, type, source, search, tags, limit = 100, offset = 0 } = await req.json();
    
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
    
    console.log('[planner-list] Cache key:', cacheKey);
    console.log('[planner-list] Redis enabled:', cache.isEnabled());

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

    // Phase 3.1: Optimized query structure to leverage new composite index
    // Index: idx_content_items_workspace_type_source_created (workspace_id, type, source, created_at)
    if (type && source) {
      // Leverages full composite index: workspace_id + type + source
      query = query.eq("type", type).eq("source", source);
    } else if (type) {
      // Partial index usage: workspace_id + type
      query = query.eq("type", type);
    } else if (source) {
      // workspace_id + source (less optimal but still indexed)
      query = query.eq("source", source);
    }
    
    // Phase 3.1: Case-insensitive search using lower() for GIN index compatibility
    if (search) {
      const searchLower = search.toLowerCase();
      // Uses idx_content_items_title_lower_trgm and idx_content_items_caption_lower_trgm
      query = query.or(`title.ilike.%${searchLower}%,caption.ilike.%${searchLower}%`);
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

    // Phase 3.4: Cache for 15 minutes (900 seconds) for heavy load (3000 VUs target)
    await cache.set(cacheKey, result, 900);

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
