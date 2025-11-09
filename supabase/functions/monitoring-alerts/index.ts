import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Alert Thresholds
const ALERTS = {
  HIGH_LATENCY: {
    type: 'high_p95_latency',
    threshold: 2000, // ms
    severity: 'critical',
    checkInterval: '1 hour',
  },
  HIGH_ERROR_RATE: {
    type: 'high_error_rate',
    threshold: 1, // at least 1 error
    severity: 'critical',
    checkInterval: '1 hour',
  },
  QUEUE_BACKLOG: {
    type: 'queue_backlog',
    threshold: 10, // pending jobs
    severity: 'warning',
    checkInterval: '15 minutes',
  },
  HIGH_JOB_FAILURE: {
    type: 'high_job_failure_rate',
    threshold: 5, // failed jobs
    severity: 'warning',
    checkInterval: '1 hour',
  },
  RATE_LIMIT_HIT: {
    type: 'rate_limit_hit_rate',
    threshold: 50, // percentage
    severity: 'info',
    checkInterval: '1 hour',
  },
};

interface AlertCheck {
  alertType: string;
  severity: string;
  triggered: boolean;
  metricValue: number;
  threshold: number;
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const posthogApiKey = Deno.env.get('POSTHOG_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendApiKey);

    console.log('[Monitoring Alerts] Starting alert check cycle...');

    const checks: AlertCheck[] = [];

    // Alert #1: High P95 Latency
    const p95Check = await checkP95Latency(supabase);
    checks.push(p95Check);

    // Alert #2: High Error Rate
    const errorCheck = await checkErrorRate(supabase);
    checks.push(errorCheck);

    // Alert #3: Queue Backlog
    const queueCheck = await checkQueueBacklog(supabase);
    checks.push(queueCheck);

    // Alert #4: High Job Failure Rate
    const failureCheck = await checkJobFailureRate(supabase);
    checks.push(failureCheck);

    // Alert #5: Rate Limit Hit Rate (if PostHog available)
    if (posthogApiKey) {
      const rateLimitCheck = await checkRateLimitHitRate();
      checks.push(rateLimitCheck);
    }

    // Process triggered alerts
    const triggeredAlerts = checks.filter(c => c.triggered);
    
    if (triggeredAlerts.length > 0) {
      console.log(`[Monitoring Alerts] ${triggeredAlerts.length} alerts triggered`);
      
      for (const alert of triggeredAlerts) {
        await handleAlert(supabase, resend, alert);
      }
    } else {
      console.log('[Monitoring Alerts] All systems operational ✅');
      
      // Mark any previously unresolved alerts as resolved
      await resolveAlerts(supabase);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        checks,
        triggeredCount: triggeredAlerts.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('[Monitoring Alerts] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

// Alert Check Functions

async function checkP95Latency(supabase: any): Promise<AlertCheck> {
  const { data, error } = await supabase
    .from('app_events')
    .select('payload_json')
    .eq('event_type', 'edge_fn_call')
    .gte('occurred_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
    .not('payload_json->duration_ms', 'is', null);

  if (error) {
    console.error('[P95 Latency] Query error:', error);
    return {
      alertType: ALERTS.HIGH_LATENCY.type,
      severity: ALERTS.HIGH_LATENCY.severity,
      triggered: false,
      metricValue: 0,
      threshold: ALERTS.HIGH_LATENCY.threshold,
      message: 'Failed to check P95 latency',
    };
  }

  const durations = (data || [])
    .map((e: any) => e.payload_json?.duration_ms)
    .filter((d: any) => typeof d === 'number')
    .sort((a: number, b: number) => a - b);

  const p95Index = Math.floor(durations.length * 0.95);
  const p95Value = durations[p95Index] || 0;

  const triggered = p95Value > ALERTS.HIGH_LATENCY.threshold;

  return {
    alertType: ALERTS.HIGH_LATENCY.type,
    severity: ALERTS.HIGH_LATENCY.severity,
    triggered,
    metricValue: p95Value,
    threshold: ALERTS.HIGH_LATENCY.threshold,
    message: triggered
      ? `🔴 CRITICAL: P95 Latency is ${p95Value}ms (threshold: ${ALERTS.HIGH_LATENCY.threshold}ms)`
      : `✅ P95 Latency: ${p95Value}ms`,
  };
}

async function checkErrorRate(supabase: any): Promise<AlertCheck> {
  const { count, error } = await supabase
    .from('app_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'edge_fn_call')
    .eq('payload_json->>success', 'false')
    .gte('occurred_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

  if (error) {
    console.error('[Error Rate] Query error:', error);
    return {
      alertType: ALERTS.HIGH_ERROR_RATE.type,
      severity: ALERTS.HIGH_ERROR_RATE.severity,
      triggered: false,
      metricValue: 0,
      threshold: ALERTS.HIGH_ERROR_RATE.threshold,
      message: 'Failed to check error rate',
    };
  }

  const errorCount = count || 0;
  const triggered = errorCount >= ALERTS.HIGH_ERROR_RATE.threshold;

  return {
    alertType: ALERTS.HIGH_ERROR_RATE.type,
    severity: ALERTS.HIGH_ERROR_RATE.severity,
    triggered,
    metricValue: errorCount,
    threshold: ALERTS.HIGH_ERROR_RATE.threshold,
    message: triggered
      ? `🔴 CRITICAL: ${errorCount} Edge Function errors in the last hour`
      : `✅ Error Rate: ${errorCount} errors`,
  };
}

async function checkQueueBacklog(supabase: any): Promise<AlertCheck> {
  const { count, error } = await supabase
    .from('ai_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()); // Last 15 minutes

  if (error) {
    console.error('[Queue Backlog] Query error:', error);
    return {
      alertType: ALERTS.QUEUE_BACKLOG.type,
      severity: ALERTS.QUEUE_BACKLOG.severity,
      triggered: false,
      metricValue: 0,
      threshold: ALERTS.QUEUE_BACKLOG.threshold,
      message: 'Failed to check queue backlog',
    };
  }

  const pendingJobs = count || 0;
  const triggered = pendingJobs >= ALERTS.QUEUE_BACKLOG.threshold;

  return {
    alertType: ALERTS.QUEUE_BACKLOG.type,
    severity: ALERTS.QUEUE_BACKLOG.severity,
    triggered,
    metricValue: pendingJobs,
    threshold: ALERTS.QUEUE_BACKLOG.threshold,
    message: triggered
      ? `⚠️ WARNING: ${pendingJobs} AI jobs pending (threshold: ${ALERTS.QUEUE_BACKLOG.threshold})`
      : `✅ Queue Backlog: ${pendingJobs} pending jobs`,
  };
}

async function checkJobFailureRate(supabase: any): Promise<AlertCheck> {
  const { count, error } = await supabase
    .from('ai_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('completed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

  if (error) {
    console.error('[Job Failure Rate] Query error:', error);
    return {
      alertType: ALERTS.HIGH_JOB_FAILURE.type,
      severity: ALERTS.HIGH_JOB_FAILURE.severity,
      triggered: false,
      metricValue: 0,
      threshold: ALERTS.HIGH_JOB_FAILURE.threshold,
      message: 'Failed to check job failure rate',
    };
  }

  const failedJobs = count || 0;
  const triggered = failedJobs >= ALERTS.HIGH_JOB_FAILURE.threshold;

  return {
    alertType: ALERTS.HIGH_JOB_FAILURE.type,
    severity: ALERTS.HIGH_JOB_FAILURE.severity,
    triggered,
    metricValue: failedJobs,
    threshold: ALERTS.HIGH_JOB_FAILURE.threshold,
    message: triggered
      ? `⚠️ WARNING: ${failedJobs} AI jobs failed in the last hour (threshold: ${ALERTS.HIGH_JOB_FAILURE.threshold})`
      : `✅ Job Failure Rate: ${failedJobs} failures`,
  };
}

async function checkRateLimitHitRate(): Promise<AlertCheck> {
  // Note: This would require PostHog API integration
  // For now, returning a placeholder
  return {
    alertType: ALERTS.RATE_LIMIT_HIT.type,
    severity: ALERTS.RATE_LIMIT_HIT.severity,
    triggered: false,
    metricValue: 0,
    threshold: ALERTS.RATE_LIMIT_HIT.threshold,
    message: '✅ Rate Limit Hit Rate: Not implemented (requires PostHog API)',
  };
}

// Alert Handling Functions

async function handleAlert(
  supabase: any,
  resend: any,
  alert: AlertCheck
): Promise<void> {
  // Check if alert already exists and is unresolved
  const { data: existing } = await supabase
    .from('alert_notifications')
    .select('*')
    .eq('alert_type', alert.alertType)
    .is('resolved_at', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  // Don't send duplicate alerts within cooldown period (1 hour)
  if (existing) {
    const sentAt = new Date(existing.sent_at);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (sentAt > hourAgo) {
      console.log(`[Alert] Skipping duplicate alert: ${alert.alertType}`);
      return;
    }
  }

  // Store alert notification
  const { error: insertError } = await supabase
    .from('alert_notifications')
    .insert({
      alert_type: alert.alertType,
      severity: alert.severity,
      metric_value: alert.metricValue,
      threshold: alert.threshold,
      message: alert.message,
    });

  if (insertError) {
    console.error('[Alert] Failed to store notification:', insertError);
  }

  // Send email notification
  try {
    // Get admin emails from profiles with admin role
    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (!adminUsers || adminUsers.length === 0) {
      console.warn('[Alert] No admin users found for notifications');
      return;
    }

    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('email')
      .in('id', adminUsers.map((u: any) => u.user_id));

    const adminEmails = (adminProfiles || []).map((p: any) => p.email).filter(Boolean);

    if (adminEmails.length === 0) {
      console.warn('[Alert] No admin emails found');
      return;
    }

    const emailBody = `
      <h2>🚨 ${alert.severity.toUpperCase()} Alert</h2>
      <p><strong>Alert Type:</strong> ${alert.alertType}</p>
      <p><strong>Message:</strong> ${alert.message}</p>
      <p><strong>Metric Value:</strong> ${alert.metricValue}</p>
      <p><strong>Threshold:</strong> ${alert.threshold}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <hr>
      <p><small>This is an automated monitoring alert from your application.</small></p>
    `;

    await resend.emails.send({
      from: 'Monitoring Alerts <alerts@resend.dev>',
      to: adminEmails,
      subject: `🚨 ${alert.severity.toUpperCase()}: ${alert.alertType}`,
      html: emailBody,
    });

    console.log(`[Alert] Email sent to ${adminEmails.length} admin(s)`);
  } catch (emailError) {
    console.error('[Alert] Failed to send email:', emailError);
  }
}

async function resolveAlerts(supabase: any): Promise<void> {
  const { error } = await supabase
    .from('alert_notifications')
    .update({ resolved_at: new Date().toISOString() })
    .is('resolved_at', null);

  if (error) {
    console.error('[Alert] Failed to resolve alerts:', error);
  } else {
    console.log('[Alert] All unresolved alerts marked as resolved');
  }
}
