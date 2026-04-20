/**
 * Weekly Health Report — runs every Sunday 08:00 via pg_cron.
 *
 * Aggregates the last 7 days of platform metrics + compares vs the
 * previous 7 days, then sends a single HTML email to ADMIN_ALERT_EMAIL.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ADMIN_ALERT_EMAIL } from '../_shared/admin-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FREE_TIER_USD = 25;
const PRICING: Record<string, number> = {
  replicate: 0.0017,
  gemini: 0.0005,
  elevenlabs: 0.003,
  openai: 0.0015,
  'lovable-ai': 0.001,
  resend: 0.0004,
};
const LAMBDA_PER_MINUTE = 0.0167;

const isTestAddr = (e: string) =>
  /^(bounced|complained|delivered)(\+[^@]*)?@resend\.dev$/i.test((e || '').trim());

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = Date.now();
    const since7d = new Date(now - 7 * 86400_000).toISOString();
    const since14d = new Date(now - 14 * 86400_000).toISOString();
    const prevWindow = new Date(now - 14 * 86400_000).toISOString();
    const prevEnd = new Date(now - 7 * 86400_000).toISOString();

    const [
      emailsThis, emailsPrev,
      providerThis, providerPrev,
      dcThis, vrThis,
      signupsThis, signupsPrev,
      activeAlerts,
    ] = await Promise.all([
      supabase.from('email_send_log').select('to_email,status').gte('created_at', since7d).limit(20_000),
      supabase.from('email_send_log').select('to_email,status').gte('created_at', prevWindow).lt('created_at', prevEnd).limit(20_000),
      supabase.from('provider_quota_log').select('provider').gte('created_at', since7d).limit(50_000),
      supabase.from('provider_quota_log').select('provider').gte('created_at', prevWindow).lt('created_at', prevEnd).limit(50_000),
      supabase.from('director_cut_renders').select('status,started_at,completed_at').gte('created_at', since7d).limit(5_000),
      supabase.from('video_renders').select('status,started_at,completed_at').gte('created_at', since7d).limit(5_000),
      supabase.from('profiles').select('id').gte('created_at', since7d).limit(5_000),
      supabase.from('profiles').select('id').gte('created_at', prevWindow).lt('created_at', prevEnd).limit(5_000),
      supabase.from('alert_notifications').select('alert_type,severity,message,sent_at').is('resolved_at', null).order('sent_at', { ascending: false }).limit(20),
    ]);

    // Email metrics (filter test addrs)
    const realEmails = (emailsThis.data ?? []).filter((e: any) => !isTestAddr(e.to_email));
    const realEmailsPrev = (emailsPrev.data ?? []).filter((e: any) => !isTestAddr(e.to_email));
    const sentCount = realEmails.filter((e: any) => e.status === 'sent').length;
    const bouncedCount = realEmails.filter((e: any) => e.status === 'bounced' || e.status === 'failed').length;
    const bounceRate = realEmails.length > 0 ? (bouncedCount / realEmails.length) * 100 : 0;
    const sentPrev = realEmailsPrev.filter((e: any) => e.status === 'sent').length;

    // Cost metrics
    let aiSpend = 0;
    for (const r of providerThis.data ?? []) aiSpend += PRICING[(r as any).provider] ?? 0;
    let aiSpendPrev = 0;
    for (const r of providerPrev.data ?? []) aiSpendPrev += PRICING[(r as any).provider] ?? 0;

    const allRenders = [...(dcThis.data ?? []), ...(vrThis.data ?? [])];
    const renderMinutes = allRenders.reduce((sum, r: any) => {
      if (!r.started_at || !r.completed_at) return sum;
      const diff = (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 60_000;
      return sum + Math.max(0, diff);
    }, 0);
    const lambdaSpend = renderMinutes * LAMBDA_PER_MINUTE;
    const totalSpend = aiSpend + lambdaSpend;
    const forecast30d = totalSpend * (30 / 7);

    // Render stats
    const successRenders = allRenders.filter((r: any) => r.status === 'completed' || r.status === 'success').length;
    const failedRenders = allRenders.filter((r: any) => r.status === 'failed' || r.status === 'error').length;
    const avgRenderMin = allRenders.length > 0 ? (renderMinutes / allRenders.length).toFixed(1) : '0';

    // Activity
    const newSignups = signupsThis.data?.length ?? 0;
    const newSignupsPrev = signupsPrev.data?.length ?? 0;

    const trend = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? '↑ neu' : '–';
      const pct = ((curr - prev) / prev) * 100;
      const arrow = pct >= 5 ? '↑' : pct <= -5 ? '↓' : '→';
      return `${arrow} ${Math.abs(pct).toFixed(0)}%`;
    };

    const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#fff;color:#111">
        <div style="background:linear-gradient(135deg,#0a0a0a,#1a1a1a);color:#d4af37;padding:32px;text-align:center">
          <h1 style="margin:0;font-size:26px;letter-spacing:1px">📊 Weekly Health Report</h1>
          <p style="margin:8px 0 0;color:#999;font-size:14px">${dateStr}</p>
        </div>

        <div style="padding:24px">
          <h2 style="font-size:18px;border-bottom:2px solid #d4af37;padding-bottom:6px">📧 Email-Health</h2>
          <table style="width:100%;border-collapse:collapse;margin:8px 0">
            <tr><td style="padding:6px 0">Versendet</td><td style="text-align:right"><b>${sentCount}</b> ${trend(sentCount, sentPrev)}</td></tr>
            <tr><td style="padding:6px 0">Bounce-Rate</td><td style="text-align:right;color:${bounceRate > 2 ? '#dc2626' : '#16a34a'}"><b>${bounceRate.toFixed(2)}%</b></td></tr>
            <tr><td style="padding:6px 0">Bounced/Failed</td><td style="text-align:right">${bouncedCount}</td></tr>
          </table>

          <h2 style="font-size:18px;border-bottom:2px solid #d4af37;padding-bottom:6px;margin-top:24px">💰 Kosten (7 Tage)</h2>
          <table style="width:100%;border-collapse:collapse;margin:8px 0">
            <tr><td style="padding:6px 0">AI / Provider</td><td style="text-align:right"><b>$${aiSpend.toFixed(2)}</b> ${trend(aiSpend, aiSpendPrev)}</td></tr>
            <tr><td style="padding:6px 0">AWS Lambda (${renderMinutes.toFixed(0)} min)</td><td style="text-align:right"><b>$${lambdaSpend.toFixed(2)}</b></td></tr>
            <tr><td style="padding:6px 0;border-top:1px solid #eee">Total 7d</td><td style="text-align:right;border-top:1px solid #eee"><b>$${totalSpend.toFixed(2)}</b></td></tr>
            <tr><td style="padding:6px 0">Forecast 30d</td><td style="text-align:right;color:${forecast30d > FREE_TIER_USD * 0.8 ? '#dc2626' : '#16a34a'}"><b>$${forecast30d.toFixed(2)}</b> / $${FREE_TIER_USD}</td></tr>
          </table>

          <h2 style="font-size:18px;border-bottom:2px solid #d4af37;padding-bottom:6px;margin-top:24px">🚀 Aktivität</h2>
          <table style="width:100%;border-collapse:collapse;margin:8px 0">
            <tr><td style="padding:6px 0">Neue Signups</td><td style="text-align:right"><b>${newSignups}</b> ${trend(newSignups, newSignupsPrev)}</td></tr>
          </table>

          <h2 style="font-size:18px;border-bottom:2px solid #d4af37;padding-bottom:6px;margin-top:24px">🎬 Renders</h2>
          <table style="width:100%;border-collapse:collapse;margin:8px 0">
            <tr><td style="padding:6px 0">Erfolgreich</td><td style="text-align:right;color:#16a34a"><b>${successRenders}</b></td></tr>
            <tr><td style="padding:6px 0">Fehlgeschlagen</td><td style="text-align:right;color:${failedRenders > 0 ? '#dc2626' : '#999'}"><b>${failedRenders}</b></td></tr>
            <tr><td style="padding:6px 0">Ø Dauer</td><td style="text-align:right">${avgRenderMin} min</td></tr>
          </table>

          ${(activeAlerts.data && activeAlerts.data.length > 0) ? `
          <h2 style="font-size:18px;border-bottom:2px solid #d4af37;padding-bottom:6px;margin-top:24px">🚨 Aktive Alerts</h2>
          <ul style="padding-left:20px;color:#444">
            ${activeAlerts.data.map((a: any) => `<li style="margin:4px 0"><b style="color:${a.severity === 'critical' ? '#dc2626' : '#f59e0b'}">${a.severity.toUpperCase()}</b> – ${a.message}</li>`).join('')}
          </ul>
          ` : '<p style="margin-top:16px;color:#16a34a"><b>✅ Keine aktiven Alerts.</b></p>'}

          <div style="margin-top:32px;text-align:center">
            <a href="https://useadtool.ai/admin" style="background:#d4af37;color:#000;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">Admin Dashboard öffnen →</a>
          </div>

          <p style="margin-top:32px;font-size:12px;color:#999;text-align:center">
            Automatisch generiert · Jeden Sonntag 08:00 Uhr
          </p>
        </div>
      </div>
    `;

    await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'weekly-health-report',
        recipientEmail: ADMIN_ALERT_EMAIL,
        idempotencyKey: `weekly-report-${new Date().toISOString().slice(0, 10)}`,
        templateData: {
          dateStr,
          sentCount,
          bounceRate: bounceRate.toFixed(2),
          aiSpend: aiSpend.toFixed(2),
          lambdaSpend: lambdaSpend.toFixed(2),
          totalSpend: totalSpend.toFixed(2),
          forecast30d: forecast30d.toFixed(2),
          newSignups,
          successRenders,
          failedRenders,
          html,
        },
      },
    });

    return new Response(
      JSON.stringify({ ok: true, recipient: ADMIN_ALERT_EMAIL, metrics: { sentCount, bounceRate, totalSpend, newSignups, successRenders, failedRenders } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[weekly-health-report] error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
