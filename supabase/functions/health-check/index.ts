import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface HealthCheck {
  healthy: boolean;
  latency_ms?: number;
  error?: string;
  [key: string]: any;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks?: {
    database: HealthCheck;
    storage: HealthCheck;
    queue: HealthCheck;
    connection_pool: HealthCheck;
  };
}

/**
 * Authorize requests for detailed metrics. Returns true if caller is an admin
 * (valid JWT + admin role) OR presents a valid X-Monitor-Key header matching
 * the HEALTHCHECK_MONITOR_KEY secret. Otherwise the response is reduced to
 * a minimal { status } payload to avoid leaking internal infrastructure metrics.
 */
async function isAuthorizedForDetails(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  // 1. Monitor key (for uptime probes)
  const monitorKey = Deno.env.get('HEALTHCHECK_MONITOR_KEY');
  if (monitorKey && req.headers.get('x-monitor-key') === monitorKey) {
    return true;
  }

  // 2. Admin JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.replace('Bearer ', '');

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error } = await userClient.auth.getClaims(token);
    if (error || !claims?.claims?.sub) return false;
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: claims.claims.sub,
      _role: 'admin',
    });
    return Boolean(isAdmin);
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { status: "healthy", timestamp: new Date().toISOString() });
  }


  try {
    const startTime = Date.now();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authorized = await isAuthorizedForDetails(req, supabase);

    // Run all checks in parallel
    const [dbCheck, storageCheck, queueCheck, poolCheck] = await Promise.all([
      checkDatabase(supabase),
      checkStorage(supabase),
      checkQueue(supabase),
      checkConnectionPool(supabase),
    ]);

    // Determine overall status
    const allHealthy = [dbCheck, storageCheck, queueCheck, poolCheck].every(c => c.healthy);
    const anyUnhealthy = [dbCheck, storageCheck, queueCheck, poolCheck].some(c => !c.healthy);

    const status: 'healthy' | 'degraded' | 'unhealthy' =
      allHealthy ? 'healthy' :
      anyUnhealthy ? 'unhealthy' :
      'degraded';

    const response: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
    };

    // Only expose detailed metrics to authorized callers
    if (authorized) {
      response.checks = {
        database: dbCheck,
        storage: storageCheck,
        queue: queueCheck,
        connection_pool: poolCheck,
      };
    }

    console.log(`[HEALTH-CHECK] Completed in ${Date.now() - startTime}ms - Status: ${status} - Detailed: ${authorized}`);

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: status === 'healthy' ? 200 : status === 'degraded' ? 207 : 503,
      }
    );
  } catch (error) {
    console.error('[HEALTH-CHECK] Fatal error:', error);
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503,
      }
    );
  }
});

async function checkDatabase(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    const latency = Date.now() - start;
    if (error) return { healthy: false, latency_ms: latency, error: error.message };
    return { healthy: latency < 500, latency_ms: latency };
  } catch (error) {
    return { healthy: false, latency_ms: Date.now() - start, error: error instanceof Error ? error.message : 'Database check failed' };
  }
}

async function checkStorage(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.storage.listBuckets();
    const latency = Date.now() - start;
    if (error) return { healthy: false, latency_ms: latency, error: error.message };
    return { healthy: latency < 2000, latency_ms: latency, bucket_count: data?.length || 0 };
  } catch (error) {
    return { healthy: false, latency_ms: Date.now() - start, error: error instanceof Error ? error.message : 'Storage check failed' };
  }
}

async function checkQueue(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { count, error } = await supabase
      .from('ai_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    const latency = Date.now() - start;
    if (error) return { healthy: false, latency_ms: latency, error: error.message };
    const pendingCount = count || 0;
    return { healthy: pendingCount < 100, latency_ms: latency, pending_jobs: pendingCount };
  } catch (error) {
    return { healthy: false, latency_ms: Date.now() - start, error: error instanceof Error ? error.message : 'Queue check failed' };
  }
}

async function checkConnectionPool(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const { count, error } = await supabase
      .from('active_ai_jobs')
      .select('id', { count: 'exact', head: true });
    const latency = Date.now() - start;
    if (error) return { healthy: false, latency_ms: latency, error: error.message };
    const activeConnections = count || 0;
    const maxConnections = 15;
    const utilizationPercent = (activeConnections / maxConnections) * 100;
    return {
      healthy: utilizationPercent < 90,
      latency_ms: latency,
      active_connections: activeConnections,
      max_connections: maxConnections,
      utilization_percent: Math.round(utilizationPercent),
    };
  } catch (error) {
    return { healthy: false, latency_ms: Date.now() - start, error: error instanceof Error ? error.message : 'Connection pool check failed' };
  }
}
