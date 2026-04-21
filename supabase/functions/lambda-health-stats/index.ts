import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lambda pricing: $0.0167 per minute (3008 MB)
const LAMBDA_USD_PER_MINUTE = 0.0167;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Warmer ping support
  try {
    const body = await req.clone().json().catch(() => ({}));
    if (body?.warmup) {
      return new Response(JSON.stringify({ warmed: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (_e) {/* no body */}

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin role check
    const { data: roleRow } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const ts1h = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    const ts24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const ts7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel data fetches
    const [
      cfgRes,
      m1hRes,
      m24hRes,
      m7dRes,
      cost24hRes,
      cost7dRes,
      errorsRes,
    ] = await Promise.all([
      admin.from('system_config').select('key,value').like('key', 'lambda%'),
      admin.from('lambda_health_metrics').select('status').gte('created_at', ts1h),
      admin.from('lambda_health_metrics').select('status,error_message,render_id,created_at').gte('created_at', ts24h),
      admin.from('lambda_health_metrics').select('status,created_at').gte('created_at', ts7d),
      admin.from('render_cost_history').select('actual_cost,estimated_cost,duration_sec').gte('created_at', ts24h),
      admin.from('render_cost_history').select('actual_cost,estimated_cost,duration_sec').gte('created_at', ts7d),
      admin.from('lambda_health_metrics')
        .select('created_at,error_message,render_id,status')
        .in('status', ['failure', 'timeout', 'oom'])
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // Concurrency state
    const cfgMap = new Map<string, string>();
    (cfgRes.data || []).forEach((r: any) => cfgMap.set(r.key, r.value));
    const normal = parseInt(cfgMap.get('lambda_max_concurrent') || '25', 10);
    const safe = parseInt(cfgMap.get('lambda_max_concurrent_safe') || '15', 10);
    // Heuristic: if you store an "active" override key, surface it; for now assume normal.
    const current = normal;
    const breakerActive = current === safe && safe < normal;

    // Failure rate helper
    const failureRate = (rows: { status: string }[] | null) => {
      if (!rows || rows.length === 0) return { total: 0, failed: 0, rate: 0 };
      const failed = rows.filter(r => r.status !== 'success').length;
      return { total: rows.length, failed, rate: failed / rows.length };
    };

    const fr1h = failureRate(m1hRes.data as any);
    const fr24h = failureRate(m24hRes.data as any);
    const fr7d = failureRate(m7dRes.data as any);

    // Outcomes (24h)
    const outcomes = { success: 0, failed: 0, oom: 0, timeout: 0 };
    (m24hRes.data || []).forEach((r: any) => {
      if (r.status === 'success') outcomes.success++;
      else if (r.status === 'oom') outcomes.oom++;
      else if (r.status === 'timeout') outcomes.timeout++;
      else outcomes.failed++;
    });

    // 7d trend — bucket by hour
    const bucketMap = new Map<string, { total: number; success: number; failed: number }>();
    for (let i = 167; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const key = `${d.toISOString().slice(0, 13)}:00`;
      bucketMap.set(key, { total: 0, success: 0, failed: 0 });
    }
    (m7dRes.data || []).forEach((r: any) => {
      const key = `${new Date(r.created_at).toISOString().slice(0, 13)}:00`;
      const b = bucketMap.get(key);
      if (b) {
        b.total++;
        if (r.status === 'success') b.success++; else b.failed++;
      }
    });
    const trend_7d = Array.from(bucketMap.entries()).map(([hour, v]) => ({ hour, ...v }));

    // Cost estimates
    const sumSeconds = (rows: any[] | null) =>
      (rows || []).reduce((acc, r) => acc + (r.duration_sec || 0), 0);

    const totalSec24h = sumSeconds(cost24hRes.data as any);
    const totalSec7d = sumSeconds(cost7dRes.data as any);
    const cost24hUsd = (totalSec24h / 60) * LAMBDA_USD_PER_MINUTE;
    const cost7dUsd = (totalSec7d / 60) * LAMBDA_USD_PER_MINUTE;
    const renders24h = (cost24hRes.data || []).length;
    const avgPerRender = renders24h > 0 ? cost24hUsd / renders24h : 0;

    // Recent errors
    const recent_errors = (errorsRes.data || []).map((r: any) => ({
      created_at: r.created_at,
      error_message: r.error_message || `(no message — status: ${r.status})`,
      render_id: r.render_id,
      status: r.status,
    }));

    const result = {
      timestamp: now.toISOString(),
      concurrency: {
        current,
        normal,
        safe,
        circuit_breaker_active: breakerActive,
      },
      failure_rate: {
        last_1h: fr1h,
        last_24h: fr24h,
        last_7d: fr7d,
      },
      outcomes,
      trend_7d,
      cost: {
        last_24h_usd: Number(cost24hUsd.toFixed(4)),
        last_7d_usd: Number(cost7dUsd.toFixed(4)),
        avg_per_render_usd: Number(avgPerRender.toFixed(4)),
        total_seconds_24h: totalSec24h,
        total_seconds_7d: totalSec7d,
        renders_24h: renders24h,
      },
      recent_errors,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('lambda-health-stats error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
