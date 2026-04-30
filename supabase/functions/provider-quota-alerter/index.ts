/**
 * Provider Quota Alerter
 * Cron job (every 5 min). Scans provider quotas and Lambda capacity.
 * Sends an email alert via send-transactional-email when any provider crosses 80% usage.
 * Cooldown: 1 email per provider per hour (tracked in alert_notifications).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ADMIN_ALERT_EMAIL } from '../_shared/admin-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const ALERT_THRESHOLD = 0.8;
const COOLDOWN_MIN = 60;

interface ProviderQuotaConfig {
  name: string;
  // Soft per-minute capacity assumptions for warning thresholds
  requestsPerMinute: number;
}

const PROVIDER_LIMITS: Record<string, ProviderQuotaConfig> = {
  replicate: { name: 'Replicate', requestsPerMinute: 600 },
  gemini: { name: 'Gemini (Lovable AI)', requestsPerMinute: 1000 },
  elevenlabs: { name: 'ElevenLabs', requestsPerMinute: 60 },
  openai: { name: 'OpenAI', requestsPerMinute: 500 },
  'lovable-ai': { name: 'Lovable AI', requestsPerMinute: 1000 },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Aggregate last-minute usage per provider
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: logs } = await supabase
      .from('provider_quota_log')
      .select('provider')
      .gte('created_at', since);

    const counts: Record<string, number> = {};
    logs?.forEach((l: any) => {
      counts[l.provider] = (counts[l.provider] ?? 0) + 1;
    });

    const alerts: any[] = [];

    for (const [provider, cfg] of Object.entries(PROVIDER_LIMITS)) {
      const used = counts[provider] ?? 0;
      const ratio = used / cfg.requestsPerMinute;
      if (ratio >= ALERT_THRESHOLD) {
        alerts.push({
          provider,
          name: cfg.name,
          used,
          limit: cfg.requestsPerMinute,
          percent: Math.round(ratio * 100),
        });
      }
    }

    // 2. Lambda capacity check
    const { data: jobs } = await supabase
      .from('render_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing');
    const activeRenders = (jobs as any)?.length ?? 0;
    const { data: lambdaCfg } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'lambda_max_concurrent')
      .maybeSingle();
    const lambdaMax = Number(lambdaCfg?.value ?? 6);
    if (activeRenders / lambdaMax >= ALERT_THRESHOLD) {
      alerts.push({
        provider: 'aws-lambda',
        name: 'AWS Lambda',
        used: activeRenders,
        limit: lambdaMax,
        percent: Math.round((activeRenders / lambdaMax) * 100),
      });
    }

    // 3. Send alerts respecting cooldown
    const sent: string[] = [];
    const skipped: string[] = [];
    const cooldownSince = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString();

    for (const alert of alerts) {
      const { data: recent } = await supabase
        .from('alert_notifications')
        .select('id')
        .eq('alert_type', `quota_${alert.provider}`)
        .gte('sent_at', cooldownSince)
        .limit(1);

      if (recent && recent.length > 0) {
        skipped.push(alert.provider);
        continue;
      }

      const message = `Provider ${alert.name} ist bei ${alert.percent}% Auslastung (${alert.used}/${alert.limit} req/min). Plan-Upgrade prüfen.`;

      await supabase.from('alert_notifications').insert({
        alert_type: `quota_${alert.provider}`,
        severity: alert.percent >= 90 ? 'critical' : 'warning',
        message,
        metric_value: alert.percent,
        threshold: ALERT_THRESHOLD * 100,
      });

      // Fire-and-forget email
      try {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            to: ADMIN_ALERT_EMAIL,
            subject: `⚠️ Provider Quota Alert: ${alert.name} bei ${alert.percent}%`,
            html: `<h2>Provider Quota Warnung</h2>
              <p><strong>${alert.name}</strong> ist bei <strong>${alert.percent}%</strong> Auslastung.</p>
              <p>${alert.used} von ${alert.limit} Requests/Minute verbraucht.</p>
              <p>Empfehlung: Plan-Upgrade prüfen oder Last reduzieren.</p>
              <hr/>
              <small>Gesendet vom Provider Quota Alerter (Cooldown ${COOLDOWN_MIN} Min)</small>`,
            purpose: 'transactional',
            idempotency_key: `quota_alert_${alert.provider}_${Math.floor(Date.now() / (COOLDOWN_MIN * 60_000))}`,
          },
        });
      } catch (e) {
        console.error('[alerter] email failed:', e);
      }

      sent.push(alert.provider);
    }

    return new Response(
      JSON.stringify({ alerts: alerts.length, sent, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[alerter] error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
