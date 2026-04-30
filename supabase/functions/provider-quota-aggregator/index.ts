/**
 * Provider Quota Aggregator
 * Cron job (every 1 min) – placeholder/no-op aggregator.
 * Currently the live view `provider_quota_stats_recent` aggregates on read.
 * This function exists to:
 *   - clean up old rows (> 7 days)
 *   - emit a heartbeat log so we know the cron is alive
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

    const { count: deletedQuota } = await supabase
      .from('provider_quota_log')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);

    const { count: deletedLambda } = await supabase
      .from('lambda_health_metrics')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);

    console.log(`[aggregator] cleaned ${deletedQuota ?? 0} quota rows, ${deletedLambda ?? 0} lambda rows`);

    return new Response(
      JSON.stringify({ ok: true, cleaned_quota: deletedQuota, cleaned_lambda: deletedLambda }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
