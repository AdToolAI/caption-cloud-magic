import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  checks: {
    database: HealthCheck;
    storage: HealthCheck;
    queue: HealthCheck;
    connection_pool: HealthCheck;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[HEALTH-CHECK] Starting comprehensive health check');
    const startTime = Date.now();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
      checks: {
        database: dbCheck,
        storage: storageCheck,
        queue: queueCheck,
        connection_pool: poolCheck,
      },
    };

    console.log(`[HEALTH-CHECK] Completed in ${Date.now() - startTime}ms - Status: ${status}`);

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: status === 'healthy' ? 200 : status === 'degraded' ? 207 : 503
      }
    );
  } catch (error) {
    console.error('[HEALTH-CHECK] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 503 
      }
    );
  }
});

async function checkDatabase(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Simple query to check database responsiveness
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    const latency = Date.now() - start;

    if (error) {
      console.error('[HEALTH-CHECK] Database error:', error);
      return {
        healthy: false,
        latency_ms: latency,
        error: error.message,
      };
    }

    // Warn if latency > 100ms, fail if > 500ms
    const healthy = latency < 500;
    const warning = latency > 100;

    return {
      healthy,
      latency_ms: latency,
      warning: warning ? 'High latency detected' : undefined,
    };
  } catch (error) {
    return {
      healthy: false,
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Database check failed',
    };
  }
}

async function checkStorage(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Check storage by listing buckets
    const { data, error } = await supabase
      .storage
      .listBuckets();

    const latency = Date.now() - start;

    if (error) {
      console.error('[HEALTH-CHECK] Storage error:', error);
      return {
        healthy: false,
        latency_ms: latency,
        error: error.message,
      };
    }

    // Warn if latency > 500ms, fail if > 2000ms
    const healthy = latency < 2000;
    const warning = latency > 500;

    return {
      healthy,
      latency_ms: latency,
      bucket_count: data?.length || 0,
      warning: warning ? 'High storage latency' : undefined,
    };
  } catch (error) {
    return {
      healthy: false,
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Storage check failed',
    };
  }
}

async function checkQueue(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Check AI job queue backlog
    const { data: pendingJobs, error } = await supabase
      .from('ai_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const latency = Date.now() - start;

    if (error) {
      console.error('[HEALTH-CHECK] Queue error:', error);
      return {
        healthy: false,
        latency_ms: latency,
        error: error.message,
      };
    }

    const pendingCount = pendingJobs?.length || 0;
    
    // Warn if > 50 pending, fail if > 100 pending
    const healthy = pendingCount < 100;
    const warning = pendingCount > 50;

    return {
      healthy,
      latency_ms: latency,
      pending_jobs: pendingCount,
      warning: warning ? `High queue backlog: ${pendingCount} jobs` : undefined,
    };
  } catch (error) {
    return {
      healthy: false,
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Queue check failed',
    };
  }
}

async function checkConnectionPool(supabase: any): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Check active connections (approximation via active_ai_jobs)
    const { data: activeJobs, error } = await supabase
      .from('active_ai_jobs')
      .select('id', { count: 'exact', head: true });

    const latency = Date.now() - start;

    if (error) {
      console.error('[HEALTH-CHECK] Connection pool error:', error);
      return {
        healthy: false,
        latency_ms: latency,
        error: error.message,
      };
    }

    const activeConnections = activeJobs?.length || 0;
    const maxConnections = 15; // Supabase default pool size
    const utilizationPercent = (activeConnections / maxConnections) * 100;

    // Warn if > 80% utilized, fail if > 90% utilized
    const healthy = utilizationPercent < 90;
    const warning = utilizationPercent > 80;

    return {
      healthy,
      latency_ms: latency,
      active_connections: activeConnections,
      max_connections: maxConnections,
      utilization_percent: Math.round(utilizationPercent),
      warning: warning ? `High connection pool utilization: ${Math.round(utilizationPercent)}%` : undefined,
    };
  } catch (error) {
    return {
      healthy: false,
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Connection pool check failed',
    };
  }
}
