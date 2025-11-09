import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { edgeCache, generateCacheKey, CacheTTL } from '../_shared/cache.ts';
import { getSupabaseClient } from '../_shared/db-client.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    const { workspace_id, type, source, search, tags, limit = 50, offset = 0 } = await req.json();

    // Generate cache key based on query parameters
    const cacheKey = generateCacheKey('planner-list', { 
      workspace_id, 
      type, 
      source, 
      search, 
      tags, 
      limit, 
      offset 
    });

    // Check cache first (2 minute TTL)
    const cached = edgeCache.get(cacheKey);
    if (cached) {
      return new Response(
        JSON.stringify(cached),
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "X-Cache": "HIT"
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

    let query = supabase
      .from("content_items")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspace_id);

    if (type) query = query.eq("type", type);
    if (source) query = query.eq("source", source);
    if (search) {
      query = query.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
    }
    if (tags && tags.length > 0) {
      query = query.overlaps("tags", tags);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const result = { items: data, total: count };

    // Cache the result for 2 minutes
    edgeCache.set(cacheKey, result, CacheTTL.ONE_MINUTE * 2);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-Cache": "MISS"
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
