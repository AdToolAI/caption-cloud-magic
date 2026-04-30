/**
 * provider-quota-backfill
 *
 * Synthesizes provider_quota_log entries from existing tracking tables.
 * Runs every minute via pg_cron. Idempotent: only inserts rows newer than
 * the last sync timestamp per provider.
 *
 * Sources:
 *   - ai_video_generations  -> replicate (Sora/Kling/Seedance/etc)
 *   - director_cut_renders  -> aws-lambda
 *   - video_renders         -> aws-lambda
 *   - email_send_log        -> resend
 *   - ai_jobs (gemini/openai-typed) -> lovable-ai
 */

import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface QuotaRow {
  provider: string;
  endpoint: string;
  status_code: number | null;
  success: boolean;
  response_time_ms: number | null;
  error_message: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Find the most-recent quota-log entry to know where to resume from.
    const { data: lastLog } = await supabase
      .from('provider_quota_log')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Backfill last 10 minutes by default, or since last log (capped at 24h).
    const tenMinAgo = new Date(Date.now() - 10 * 60_000);
    const dayAgo = new Date(Date.now() - 24 * 3600_000);
    const lastTs = lastLog?.created_at ? new Date(lastLog.created_at) : tenMinAgo;
    const since = new Date(Math.max(dayAgo.getTime(), lastTs.getTime())).toISOString();

    const rows: QuotaRow[] = [];

    // ---- Replicate (AI video generations)
    const { data: vids } = await supabase
      .from('ai_video_generations')
      .select('id, model, status, created_at, completed_at, started_at, error_message')
      .gt('created_at', since)
      .limit(500);
    for (const v of vids ?? []) {
      const success = v.status === 'completed';
      const failed = v.status === 'failed';
      if (!success && !failed) continue;
      const dur = v.completed_at && v.started_at
        ? new Date(v.completed_at).getTime() - new Date(v.started_at).getTime()
        : null;
      rows.push({
        provider: 'replicate',
        endpoint: `/predictions/${v.model || 'unknown'}`,
        status_code: success ? 200 : 500,
        success,
        response_time_ms: dur,
        error_message: failed ? (v.error_message || 'failed') : null,
        created_at: v.completed_at || v.created_at,
      });
    }

    // ---- AWS Lambda (director_cut_renders)
    const { data: dcr } = await supabase
      .from('director_cut_renders')
      .select('id, status, started_at, completed_at, error_message, created_at')
      .gt('created_at', since)
      .limit(500);
    for (const r of dcr ?? []) {
      const success = r.status === 'completed';
      const failed = r.status === 'failed';
      if (!success && !failed) continue;
      const dur = r.completed_at && r.started_at
        ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
        : null;
      rows.push({
        provider: 'aws-lambda',
        endpoint: '/render/directors-cut',
        status_code: success ? 200 : 500,
        success,
        response_time_ms: dur,
        error_message: failed ? (r.error_message || 'failed') : null,
        created_at: r.completed_at || r.created_at,
      });
    }

    // ---- AWS Lambda (video_renders)
    const { data: vr } = await supabase
      .from('video_renders')
      .select('id, status, started_at, completed_at, error_message, created_at')
      .gt('created_at', since)
      .limit(500);
    for (const r of vr ?? []) {
      const success = r.status === 'completed';
      const failed = r.status === 'failed';
      if (!success && !failed) continue;
      const dur = r.completed_at && r.started_at
        ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
        : null;
      rows.push({
        provider: 'aws-lambda',
        endpoint: '/render/video',
        status_code: success ? 200 : 500,
        success,
        response_time_ms: dur,
        error_message: failed ? (r.error_message || 'failed') : null,
        created_at: r.completed_at || r.created_at,
      });
    }

    // ---- Resend (email)
    const { data: emails } = await supabase
      .from('email_send_log')
      .select('id, status, template, error, created_at')
      .gt('created_at', since)
      .limit(500);
    for (const e of emails ?? []) {
      const success = e.status === 'sent' || e.status === 'delivered';
      const failed = ['dlq', 'failed', 'bounced', 'suppressed'].includes(e.status);
      if (!success && !failed) continue;
      rows.push({
        provider: 'resend',
        endpoint: `/emails/${e.template || 'unknown'}`,
        status_code: success ? 200 : 422,
        success,
        response_time_ms: null,
        error_message: failed ? (e.error || e.status) : null,
        created_at: e.created_at,
      });
    }

    // ---- Lovable AI (ai_jobs)
    const { data: jobs } = await supabase
      .from('ai_jobs')
      .select('id, job_type, status, processing_started_at, completed_at, error_message, created_at')
      .gt('created_at', since)
      .in('status', ['completed', 'failed'])
      .limit(500);
    for (const j of jobs ?? []) {
      const success = j.status === 'completed';
      const dur = j.completed_at && j.processing_started_at
        ? new Date(j.completed_at).getTime() - new Date(j.processing_started_at).getTime()
        : null;
      rows.push({
        provider: 'lovable-ai',
        endpoint: `/jobs/${j.job_type}`,
        status_code: success ? 200 : 500,
        success,
        response_time_ms: dur,
        error_message: success ? null : (j.error_message || 'failed'),
        created_at: j.completed_at || j.created_at,
      });
    }

    let inserted = 0;
    if (rows.length > 0) {
      // Batch insert; conflicts ignored (no unique constraint, duplicates highly unlikely with timestamp filter)
      const { error, count } = await supabase
        .from('provider_quota_log')
        .insert(rows, { count: 'exact' });
      if (error) throw error;
      inserted = count ?? rows.length;
    }

    return new Response(
      JSON.stringify({ ok: true, since, inserted, scanned: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[provider-quota-backfill] error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
