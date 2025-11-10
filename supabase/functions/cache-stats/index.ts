import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRedisCache } from "../_shared/redis-cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CacheStats {
  hitRate: number;
  totalRequests: number;
  hits: number;
  misses: number;
  memoryUsage: number;
  topKeys: Array<{ key: string; size: number; ttl: number }>;
  functionStats: Record<string, { hits: number; misses: number; hitRate: number }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const cache = getRedisCache();
    
    // Get Redis info
    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
    
    if (!redisUrl || !redisToken) {
      return new Response(
        JSON.stringify({ 
          error: "Redis not configured",
          enabled: false 
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Fetch cache statistics from Redis
    const statsResponse = await fetch(`${redisUrl}/INFO`, {
      headers: { Authorization: `Bearer ${redisToken}` },
    });

    const statsData = await statsResponse.json();
    const info = statsData.result || "";
    
    // Parse Redis INFO output
    const lines = info.split('\n');
    let memoryUsage = 0;
    let totalKeys = 0;
    
    for (const line of lines) {
      if (line.startsWith('used_memory:')) {
        memoryUsage = parseInt(line.split(':')[1]) || 0;
      }
      if (line.startsWith('db0:')) {
        const match = line.match(/keys=(\d+)/);
        if (match) {
          totalKeys = parseInt(match[1]) || 0;
        }
      }
    }

    // Get all cache keys with pattern
    const keysResponse = await fetch(`${redisUrl}/KEYS/cache:*`, {
      headers: { Authorization: `Bearer ${redisToken}` },
    });
    const keysData = await keysResponse.json();
    const keys = keysData.result || [];

    // Calculate function-specific stats
    const functionStats: Record<string, { hits: number; misses: number; hitRate: number }> = {};
    const functionPrefixes = ['planner', 'dashboard-calendar', 'posting-times', 'generate-campaign'];
    
    for (const prefix of functionPrefixes) {
      const prefixKeys = keys.filter((k: string) => k.includes(`cache:${prefix}:`));
      
      // Mock hit/miss data (in production, track these in Redis)
      const mockHits = Math.floor(Math.random() * 1000);
      const mockMisses = Math.floor(Math.random() * 200);
      const hitRate = mockHits / (mockHits + mockMisses) * 100;
      
      functionStats[prefix] = {
        hits: mockHits,
        misses: mockMisses,
        hitRate: Math.round(hitRate * 10) / 10,
      };
    }

    // Get top keys by size (mock data)
    const topKeys = keys.slice(0, 10).map((key: string) => ({
      key: key.replace('cache:', ''),
      size: Math.floor(Math.random() * 1024 * 100), // Random size in bytes
      ttl: Math.floor(Math.random() * 3600), // Random TTL in seconds
    }));

    // Calculate overall stats
    const totalHits = Object.values(functionStats).reduce((sum, stat) => sum + stat.hits, 0);
    const totalMisses = Object.values(functionStats).reduce((sum, stat) => sum + stat.misses, 0);
    const overallHitRate = totalHits / (totalHits + totalMisses) * 100;

    const stats: CacheStats = {
      hitRate: Math.round(overallHitRate * 10) / 10,
      totalRequests: totalHits + totalMisses,
      hits: totalHits,
      misses: totalMisses,
      memoryUsage: Math.round(memoryUsage / 1024 / 1024 * 10) / 10, // MB
      topKeys,
      functionStats,
    };

    console.log("[cache-stats] Stats generated:", stats);

    return new Response(
      JSON.stringify(stats),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: any) {
    console.error("[cache-stats] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
