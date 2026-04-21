import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AggregatedStats {
  redis: {
    enabled: boolean;
    totalRequests: number;
    hits: number;
    misses: number;
    hitRate: number;
    avgLatencyMs: number;
  };
  semantic: {
    totalRequests: number;
    hits: number;
    misses: number;
    hitRate: number;
    avgLatencyMs: number;
    cachedEntries: number;
  };
  byEndpoint: Array<{
    endpoint: string;
    cacheType: string;
    hits: number;
    misses: number;
    hitRate: number;
    avgLatencyMs: number;
  }>;
  topAiCacheEntries: Array<{
    endpoint: string;
    hitCount: number;
    promptPreview: string;
    language: string;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Check admin role
    const { data: roleCheck } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!roleCheck) throw new Error("Admin only");

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch aggregated stats from view
    const { data: aggregated } = await service
      .from("cache_stats_recent")
      .select("*");

    const byEndpoint = (aggregated ?? []).map((row: any) => ({
      endpoint: row.endpoint,
      cacheType: row.cache_type,
      hits: Number(row.hits) || 0,
      misses: Number(row.misses) || 0,
      hitRate: Number(row.hit_rate_pct) || 0,
      avgLatencyMs: Number(row.avg_latency_ms) || 0,
    }));

    // Aggregate Redis stats
    const redisRows = byEndpoint.filter((r) => r.cacheType === "redis");
    const redisTotal = redisRows.reduce((s, r) => s + r.hits + r.misses, 0);
    const redisHits = redisRows.reduce((s, r) => s + r.hits, 0);
    const redisMisses = redisRows.reduce((s, r) => s + r.misses, 0);
    const redisAvgLatency = redisRows.length
      ? Math.round(redisRows.reduce((s, r) => s + r.avgLatencyMs, 0) / redisRows.length)
      : 0;

    // Aggregate semantic stats
    const semRows = byEndpoint.filter((r) => r.cacheType === "ai_semantic");
    const semTotal = semRows.reduce((s, r) => s + r.hits + r.misses, 0);
    const semHits = semRows.reduce((s, r) => s + r.hits, 0);
    const semMisses = semRows.reduce((s, r) => s + r.misses, 0);
    const semAvgLatency = semRows.length
      ? Math.round(semRows.reduce((s, r) => s + r.avgLatencyMs, 0) / semRows.length)
      : 0;

    // Count of stored AI cache entries
    const { count: cachedEntries } = await service
      .from("ai_response_cache")
      .select("*", { count: "exact", head: true })
      .gt("expires_at", new Date().toISOString());

    // Top entries by hit count
    const { data: topEntries } = await service
      .from("ai_response_cache")
      .select("endpoint, hit_count, prompt_text, language")
      .gt("expires_at", new Date().toISOString())
      .order("hit_count", { ascending: false })
      .limit(10);

    const result: AggregatedStats = {
      redis: {
        enabled: Boolean(Deno.env.get("UPSTASH_REDIS_REST_URL")),
        totalRequests: redisTotal,
        hits: redisHits,
        misses: redisMisses,
        hitRate: redisTotal > 0 ? Math.round((redisHits / redisTotal) * 1000) / 10 : 0,
        avgLatencyMs: redisAvgLatency,
      },
      semantic: {
        totalRequests: semTotal,
        hits: semHits,
        misses: semMisses,
        hitRate: semTotal > 0 ? Math.round((semHits / semTotal) * 1000) / 10 : 0,
        avgLatencyMs: semAvgLatency,
        cachedEntries: cachedEntries ?? 0,
      },
      byEndpoint,
      topAiCacheEntries: (topEntries ?? []).map((e: any) => ({
        endpoint: e.endpoint,
        hitCount: e.hit_count ?? 0,
        promptPreview: (e.prompt_text ?? "").slice(0, 80),
        language: e.language ?? "en",
      })),
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[cache-stats-aggregator] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
