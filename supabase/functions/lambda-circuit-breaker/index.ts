/**
 * Lambda Circuit Breaker
 * Cron job (every 5 min) that analyzes lambda_health_metrics and adjusts
 * system_config.lambda_max_concurrent automatically:
 *  - failure_rate > threshold → fall back to lambda_max_concurrent_safe (3)
 *  - failure_rate normal AND currently degraded → restore to 6
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Read config
    const { data: configRows } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', [
        'lambda_max_concurrent',
        'lambda_max_concurrent_safe',
        'lambda_circuit_breaker_threshold',
        'lambda_circuit_breaker_window_min',
      ]);

    const cfg: Record<string, unknown> = {};
    configRows?.forEach((r: any) => (cfg[r.key] = r.value));

    const SAFE = Number(cfg.lambda_max_concurrent_safe ?? 3);
    const NORMAL = 6;
    const THRESHOLD = Number(cfg.lambda_circuit_breaker_threshold ?? 0.3);
    const WINDOW_MIN = Number(cfg.lambda_circuit_breaker_window_min ?? 10);
    const CURRENT = Number(cfg.lambda_max_concurrent ?? 6);

    // Analyze last N min
    const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
    const { data: metrics } = await supabase
      .from('lambda_health_metrics')
      .select('status')
      .gte('created_at', since);

    const total = metrics?.length ?? 0;
    const failed = metrics?.filter((m: any) =>
      ['failure', 'timeout', 'oom'].includes(m.status)
    ).length ?? 0;
    const failureRate = total > 0 ? failed / total : 0;

    let newValue = CURRENT;
    let action = 'no_change';

    // Need minimum sample size to act
    if (total >= 5) {
      if (failureRate > THRESHOLD && CURRENT > SAFE) {
        newValue = SAFE;
        action = 'tripped';
      } else if (failureRate <= THRESHOLD * 0.5 && CURRENT < NORMAL) {
        newValue = NORMAL;
        action = 'restored';
      }
    }

    if (newValue !== CURRENT) {
      await supabase
        .from('system_config')
        .update({ value: newValue, updated_at: new Date().toISOString() })
        .eq('key', 'lambda_max_concurrent');
      console.log(`[circuit-breaker] ${action}: ${CURRENT} → ${newValue} (rate=${failureRate.toFixed(2)})`);
    }

    return new Response(
      JSON.stringify({
        action,
        current_value: newValue,
        previous_value: CURRENT,
        failure_rate: failureRate,
        sample_size: total,
        window_min: WINDOW_MIN,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[circuit-breaker] error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
