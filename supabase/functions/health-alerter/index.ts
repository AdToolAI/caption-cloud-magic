/**
 * Health Alerter — runs every 10 minutes via pg_cron.
 *
 * Five checks that complement provider-quota-alerter:
 *   1. Bounce rate >2% (last 24h, real addresses only)
 *   2. Cost forecast >80% of $25 free tier  (warning, 6h cooldown)
 *   3. Cost forecast >100% of $25 free tier (critical, 1h cooldown)
 *   4. Provider failures >3 in 5 minutes    (critical, 15m cooldown)
 *   5. Cache hit-rate <50% over last hour   (warning, 2h cooldown)
 *
 * Auto-resolve: when a check passes again, the open alert of that type
 * gets resolved_at = now().  Cleanup: alerts older than 30 days are
 * deleted on every run to keep the table small.
 *
 * Email alerts go to ADMIN_ALERT_EMAIL via send-transactional-email
 * (template: alert-warning).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { ADMIN_ALERT_EMAIL } from '../_shared/admin-config.ts';
import { sendEmail } from '../_shared/email-send.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const FREE_TIER_USD = 25; // Lovable Cloud free-tier ceiling
const PRICING: Record<string, number> = {
  replicate: 0.0017,
  gemini: 0.0005,
  elevenlabs: 0.003,
  openai: 0.0015,
  'lovable-ai': 0.001,
  resend: 0.0004,
};
const LAMBDA_PER_MINUTE = 0.0167;

interface AlertSpec {
  alert_type: string;
  severity: 'warning' | 'critical';
  metric_value: number;
  threshold: number;
  message: string;
  recommendation: string;
  cooldown_minutes: number;
}

const isTestAddr = (email: string) =>
  /^(bounced|complained|delivered)(\+[^@]*)?@resend\.dev$/i.test((email || '').trim());

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = Date.now();
    const triggered: AlertSpec[] = [];
    const resolvedTypes: string[] = [];

    // ─── 1. BOUNCE RATE >2% (last 24h) ─────────────────────────────
    const since24h = new Date(now - 24 * 3600_000).toISOString();
    const { data: emails } = await supabase
      .from('email_send_log')
      .select('to_email,status')
      .gte('created_at', since24h)
      .limit(10_000);

    const realEmails = (emails ?? []).filter((e: any) => !isTestAddr(e.to_email));
    const bounced = realEmails.filter((e: any) => e.status === 'bounced' || e.status === 'failed').length;
    const total = realEmails.length;
    const bounceRate = total > 0 ? (bounced / total) * 100 : 0;

    if (total >= 20 && bounceRate > 2) {
      triggered.push({
        alert_type: 'bounce_rate_high',
        severity: bounceRate > 5 ? 'critical' : 'warning',
        metric_value: Number(bounceRate.toFixed(2)),
        threshold: 2,
        message: `Bounce-Rate bei ${bounceRate.toFixed(2)}% (${bounced}/${total} Mails in 24h).`,
        recommendation: 'Suppression-Liste prüfen, Sender-Reputation kontrollieren.',
        cooldown_minutes: 60,
      });
    } else if (total >= 20) {
      resolvedTypes.push('bounce_rate_high');
    }

    // ─── 2. & 3. COST FORECAST vs $25 FREE TIER ────────────────────
    const since7d = new Date(now - 7 * 86400_000).toISOString();
    const [providerRes, dcRes, vrRes] = await Promise.all([
      supabase.from('provider_quota_log')
        .select('provider').gte('created_at', since7d).limit(50_000),
      supabase.from('director_cut_renders')
        .select('started_at,completed_at').gte('created_at', since7d).limit(5_000),
      supabase.from('video_renders')
        .select('started_at,completed_at').gte('created_at', since7d).limit(5_000),
    ]);

    let aiSpend = 0;
    for (const row of providerRes.data ?? []) {
      aiSpend += PRICING[(row as any).provider] ?? 0;
    }

    const renderMinutes = [...(dcRes.data ?? []), ...(vrRes.data ?? [])].reduce((sum, r: any) => {
      if (!r.started_at || !r.completed_at) return sum;
      const diff = (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 60_000;
      return sum + Math.max(0, diff);
    }, 0);
    const lambdaSpend = renderMinutes * LAMBDA_PER_MINUTE;

    // 7-day spend → 30-day forecast
    const forecast30d = (aiSpend + lambdaSpend) * (30 / 7);
    const forecastPct = (forecast30d / FREE_TIER_USD) * 100;

    if (forecastPct > 100) {
      triggered.push({
        alert_type: 'cost_forecast_critical',
        severity: 'critical',
        metric_value: Number(forecastPct.toFixed(1)),
        threshold: 100,
        message: `Cost-Forecast: $${forecast30d.toFixed(2)} = ${forecastPct.toFixed(0)}% des $${FREE_TIER_USD} Free-Tiers.`,
        recommendation: 'Sofort Provider-Calls reduzieren oder Plan upgraden.',
        cooldown_minutes: 60,
      });
      resolvedTypes.push('cost_forecast_warning');
    } else if (forecastPct > 80) {
      triggered.push({
        alert_type: 'cost_forecast_warning',
        severity: 'warning',
        metric_value: Number(forecastPct.toFixed(1)),
        threshold: 80,
        message: `Cost-Forecast bei ${forecastPct.toFixed(0)}% des Free-Tiers (Hochrechnung $${forecast30d.toFixed(2)} / $${FREE_TIER_USD}).`,
        recommendation: 'Cache-Hit-Rate erhöhen, teure Provider-Calls überprüfen.',
        cooldown_minutes: 360,
      });
      resolvedTypes.push('cost_forecast_critical');
    } else {
      resolvedTypes.push('cost_forecast_warning', 'cost_forecast_critical');
    }

    // ─── 4. PROVIDER FAILURES >3 in 5 MIN ──────────────────────────
    const since5m = new Date(now - 5 * 60_000).toISOString();
    const { data: failures } = await supabase
      .from('provider_quota_log')
      .select('provider')
      .eq('success', false)
      .gte('created_at', since5m)
      .limit(100);

    const failCount = failures?.length ?? 0;
    if (failCount > 3) {
      const byProvider: Record<string, number> = {};
      for (const f of failures ?? []) {
        const p = (f as any).provider ?? 'unknown';
        byProvider[p] = (byProvider[p] ?? 0) + 1;
      }
      const topProvider = Object.entries(byProvider).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
      triggered.push({
        alert_type: 'provider_failure_spike',
        severity: 'critical',
        metric_value: failCount,
        threshold: 3,
        message: `${failCount} Provider-Failures in 5 Min (${topProvider} am häufigsten).`,
        recommendation: `${topProvider} Status-Page checken, ggf. Fallback-Provider aktivieren.`,
        cooldown_minutes: 15,
      });
    } else {
      resolvedTypes.push('provider_failure_spike');
    }

    // ─── 5. CACHE HIT-RATE <50% (last hour) ────────────────────────
    const since1h = new Date(now - 3600_000).toISOString();
    const { data: cache } = await supabase
      .from('cache_stats')
      .select('hit')
      .gte('recorded_at', since1h)
      .limit(5_000);

    const cacheTotal = cache?.length ?? 0;
    const cacheHits = (cache ?? []).filter((c: any) => c.hit).length;
    const hitRate = cacheTotal > 0 ? (cacheHits / cacheTotal) * 100 : 100;

    if (cacheTotal >= 30 && hitRate < 50) {
      triggered.push({
        alert_type: 'cache_hit_rate_low',
        severity: 'warning',
        metric_value: Number(hitRate.toFixed(1)),
        threshold: 50,
        message: `Cache Hit-Rate bei ${hitRate.toFixed(1)}% (${cacheHits}/${cacheTotal} Anfragen in 1h).`,
        recommendation: 'TTLs prüfen, Cache-Keys validieren, ggf. Cache vorwärmen.',
        cooldown_minutes: 120,
      });
    } else if (cacheTotal >= 30) {
      resolvedTypes.push('cache_hit_rate_low');
    }

    // ─── INSERT NEW ALERTS (mit Cooldown-Check) ────────────────────
    const sentEmails: string[] = [];
    const skipped: string[] = [];

    for (const alert of triggered) {
      const cooldownSince = new Date(now - alert.cooldown_minutes * 60_000).toISOString();
      const { data: recent } = await supabase
        .from('alert_notifications')
        .select('id')
        .eq('alert_type', alert.alert_type)
        .gte('sent_at', cooldownSince)
        .limit(1);

      if (recent && recent.length > 0) {
        skipped.push(alert.alert_type);
        continue;
      }

      await supabase.from('alert_notifications').insert({
        alert_type: alert.alert_type,
        severity: alert.severity,
        metric_value: alert.metric_value,
        threshold: alert.threshold,
        message: alert.message,
      });

      try {
        const sevColor = alert.severity === 'critical' ? '#dc2626' : '#f59e0b';
        const sevLabel = alert.severity === 'critical' ? '🚨 CRITICAL' : '⚠️ WARNING';
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
            <div style="background:${sevColor};color:#fff;padding:20px;text-align:center">
              <h1 style="margin:0;font-size:22px">${sevLabel}</h1>
              <p style="margin:6px 0 0;font-size:14px;opacity:.9">${alert.alert_type}</p>
            </div>
            <div style="padding:24px;color:#111">
              <p style="font-size:16px;margin:0 0 16px"><b>${alert.message}</b></p>
              <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
                <tr><td style="padding:6px 0;color:#666">Wert</td><td style="text-align:right"><b>${alert.metric_value}</b></td></tr>
                <tr><td style="padding:6px 0;color:#666">Schwelle</td><td style="text-align:right">${alert.threshold}</td></tr>
              </table>
              <div style="margin-top:20px;padding:14px;background:#f9fafb;border-left:3px solid ${sevColor};border-radius:4px">
                <p style="margin:0;font-size:14px;color:#444"><b>Empfehlung:</b><br/>${alert.recommendation}</p>
              </div>
              <div style="margin-top:24px;text-align:center">
                <a href="https://useadtool.ai/admin" style="background:#d4af37;color:#000;padding:11px 22px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">Admin Dashboard öffnen →</a>
              </div>
              <p style="margin-top:24px;font-size:11px;color:#999;text-align:center">
                Cooldown: ${alert.cooldown_minutes} Min · automatisch generiert
              </p>
            </div>
          </div>`;

        await sendEmail({
          to: ADMIN_ALERT_EMAIL,
          subject: `${sevLabel} ${alert.alert_type}: ${alert.message.slice(0, 80)}`,
          html,
          template: `alert-${alert.alert_type}`,
          category: 'system',
        });
        sentEmails.push(alert.alert_type);
      } catch (e) {
        console.error('[health-alerter] email failed:', e);
      }
    }

    // ─── AUTO-RESOLVE (Werte wieder ok) ────────────────────────────
    if (resolvedTypes.length > 0) {
      await supabase
        .from('alert_notifications')
        .update({ resolved_at: new Date().toISOString() })
        .in('alert_type', Array.from(new Set(resolvedTypes)))
        .is('resolved_at', null);
    }

    // ─── CLEANUP (>30 Tage alt) ────────────────────────────────────
    const cleanupBefore = new Date(now - 30 * 86400_000).toISOString();
    await supabase
      .from('alert_notifications')
      .delete()
      .lt('created_at', cleanupBefore);

    return new Response(
      JSON.stringify({
        ok: true,
        triggered: triggered.length,
        sent: sentEmails,
        skipped,
        auto_resolved: Array.from(new Set(resolvedTypes)),
        metrics: {
          bounce_rate: bounceRate.toFixed(2),
          forecast_30d_usd: forecast30d.toFixed(2),
          forecast_pct: forecastPct.toFixed(1),
          provider_failures_5m: failCount,
          cache_hit_rate: hitRate.toFixed(1),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[health-alerter] error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
