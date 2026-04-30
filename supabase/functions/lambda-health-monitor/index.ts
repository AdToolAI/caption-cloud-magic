/**
 * Lambda Health Monitor (Cron, every 5 min)
 * Detects 3 conditions and writes alerts into `alert_notifications` (with 60-min cooldown):
 *   1. Circuit breaker tripped         → lambda_max_concurrent < lambda_max_concurrent_safe
 *   2. OOM-Errors                      → ≥5 entries with status='oom' in lambda_health_metrics in last 1h
 *   3. Render queue backlog            → ≥20 jobs status='queued' older than 10 min
 *
 * Best-effort email notification via Resend if RESEND_API_KEY is set; otherwise DB-log only.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const COOLDOWN_MIN = 60;

type AlertCheck = {
  type: string;          // alert_type
  triggered: boolean;
  severity: 'info' | 'warning' | 'critical';
  threshold: number;
  metric_value: number;
  message: string;
};

async function maybeSendEmail(subject: string, html: string, admins: string[]) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey || admins.length === 0) return { sent: false, reason: 'no_api_key_or_recipients' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Lambda Monitor <alerts@useadtool.ai>',
        to: admins,
        subject,
        html,
      }),
    });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : 'unknown' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Pull current config
    const { data: cfgRows } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['lambda_max_concurrent', 'lambda_max_concurrent_safe']);
    const cfg: Record<string, number> = {};
    cfgRows?.forEach((r: any) => (cfg[r.key] = Number(r.value)));
    const NORMAL = cfg.lambda_max_concurrent ?? 25;
    const SAFE = cfg.lambda_max_concurrent_safe ?? 15;

    const checks: AlertCheck[] = [];

    // 1a. Circuit breaker tripped?
    checks.push({
      type: 'lambda_circuit_breaker_tripped',
      triggered: NORMAL < SAFE,
      severity: 'critical',
      threshold: SAFE,
      metric_value: NORMAL,
      message: `Circuit breaker tripped: lambda_max_concurrent=${NORMAL} < lambda_max_concurrent_safe=${SAFE}`,
    });

    // 1b. OOM count last hour
    const sinceHour = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count: oomCount } = await supabase
      .from('lambda_health_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'oom')
      .gte('created_at', sinceHour);
    checks.push({
      type: 'lambda_oom_burst',
      triggered: (oomCount ?? 0) >= 5,
      severity: 'critical',
      threshold: 5,
      metric_value: oomCount ?? 0,
      message: `${oomCount ?? 0} OOM errors in lambda_health_metrics in the last hour`,
    });

    // 1c. Queue backlog: jobs queued AND older than 10 min
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count: backlogCount } = await supabase
      .from('render_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')
      .lte('created_at', tenMinAgo);
    checks.push({
      type: 'render_queue_backlog',
      triggered: (backlogCount ?? 0) >= 20,
      severity: 'warning',
      threshold: 20,
      metric_value: backlogCount ?? 0,
      message: `${backlogCount ?? 0} render jobs stuck in queue >10 min`,
    });

    // 2. For each triggered check, respect cooldown
    const cutoffCooldown = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString();
    const triggeredAlerts: any[] = [];
    const skippedAlerts: any[] = [];

    for (const c of checks.filter((x) => x.triggered)) {
      const { data: recent } = await supabase
        .from('alert_notifications')
        .select('id, sent_at')
        .eq('alert_type', c.type)
        .gte('sent_at', cutoffCooldown)
        .limit(1);
      if (recent && recent.length > 0) {
        skippedAlerts.push({ type: c.type, reason: 'cooldown' });
        continue;
      }
      const { data: ins, error } = await supabase
        .from('alert_notifications')
        .insert({
          alert_type: c.type,
          severity: c.severity,
          threshold: c.threshold,
          metric_value: c.metric_value,
          message: c.message,
        })
        .select()
        .single();
      if (error) {
        console.error('[lambda-health-monitor] insert error:', error.message);
        continue;
      }
      triggeredAlerts.push(ins);
    }

    // 3. Optional email to admins (best-effort; only when at least one new alert)
    let emailResult: any = { sent: false, reason: 'no_new_alerts' };
    if (triggeredAlerts.length > 0) {
      // Look up admin emails via user_roles -> profiles
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      const adminIds = (adminRoles ?? []).map((r: any) => r.user_id);
      let admins: string[] = [];
      if (adminIds.length > 0) {
        const { data: adminProfiles } = await supabase
          .from('profiles')
          .select('email')
          .in('id', adminIds);
        admins = (adminProfiles ?? []).map((p: any) => p.email).filter(Boolean);
      }
      const html = `
        <h2>Lambda Health Alerts</h2>
        <ul>
          ${triggeredAlerts
            .map(
              (a: any) =>
                `<li><strong>${a.alert_type}</strong> (${a.severity}): ${a.message}</li>`
            )
            .join('')}
        </ul>
        <p>Open: <a href="https://useadtool.ai/admin/provider-health">Provider Health</a></p>
      `;
      emailResult = await maybeSendEmail(
        `[Lambda Monitor] ${triggeredAlerts.length} new alert(s)`,
        html,
        admins
      );
    }

    return new Response(
      JSON.stringify({
        checks,
        triggered: triggeredAlerts.length,
        skipped_due_to_cooldown: skippedAlerts.length,
        email: emailResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[lambda-health-monitor] error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
