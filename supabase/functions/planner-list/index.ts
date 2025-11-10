import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getRedisCache } from '../_shared/redis-cache.ts';
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

    // Check Redis cache first (2 minute TTL)
    const cached = await cache.get(cacheKey, { logHits: true });
    if (cached) {
      return new Response(
        JSON.stringify(cached),
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "X-Cache": "REDIS-HIT"
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

    // Cache the result in Redis for 2 minutes (120 seconds)
    await cache.set(cacheKey, result, 120);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "X-Cache": "REDIS-MISS"
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
