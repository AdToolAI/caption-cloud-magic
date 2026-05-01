/**
 * QA Bug Harvester
 *
 * Scans `provider_quota_log` for failed external API calls in the last 24h,
 * fingerprints them, and creates ONE `qa_bug_reports` entry per fingerprint
 * (unless an open or recently-resolved bug with the same fingerprint exists).
 *
 * Designed to surface real production bugs that the Deep Sweep does not
 * trigger directly (e.g. NaN sequence bounds, codec issues, off-by-one frames).
 *
 * Schedule: daily via pg_cron (set up separately). Also callable on-demand.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { recordHeartbeat } from '../_shared/heartbeat.ts';
import { withSentryCron } from '../_shared/sentryCron.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Normalize an error message into a stable fingerprint (first meaningful line). */
function fingerprint(msg: string): string {
  const firstLine = (msg || '').split('\n')[0].trim();
  // Strip variable parts: render IDs, URLs, hex hashes, line/col numbers
  return firstLine
    .replace(/https?:\/\/\S+/g, '<URL>')
    .replace(/[a-f0-9]{16,}/gi, '<HASH>')
    .replace(/:\d+:\d+/g, ':L:C')
    .replace(/\d{4,}/g, '<N>')
    .slice(0, 200);
}

/** Heuristic severity classifier from the error text. */
function classifySeverity(msg: string): 'high' | 'medium' | 'low' | 'ignore' {
  const m = (msg || '').toLowerCase();
  if (m.includes('rate exceeded') || m.includes('rate limit') || m.includes('throttl')) {
    return 'ignore'; // infrastructure noise, not a code bug
  }
  if (m.includes('nan') || m.includes('finite') || m.includes('undefined') || m.includes('null')) {
    return 'high';
  }
  if (m.includes('media_element_error') || m.includes('codec') || m.includes('format error')) {
    return 'medium';
  }
  if (m.includes('durationinframes') || m.includes('frame range')) {
    return 'high';
  }
  return 'medium';
}

function classifyCategory(provider: string, msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('nan') || m.includes('finite') || m.includes('frame range') || m.includes('durationinframes')) {
    return 'data-integrity';
  }
  if (m.includes('media_element_error') || m.includes('codec') || m.includes('format error')) {
    return 'workflow';
  }
  if (provider === 'aws-lambda') return 'workflow';
  if (provider === 'replicate' || provider === 'gemini' || provider === 'openai' || provider === 'lovable-ai') {
    return 'workflow';
  }
  if (provider === 'elevenlabs') return 'workflow';
  if (provider === 'resend') return 'network';
  return 'regression';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const hbStart = Date.now();
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Pull failed provider calls from the last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: failures, error: fetchErr } = await sb
    .from('provider_quota_log')
    .select('provider, endpoint, error_message, created_at')
    .eq('success', false)
    .gte('created_at', since)
    .not('error_message', 'is', null)
    .limit(2000);

  if (fetchErr) {
    return new Response(
      JSON.stringify({ ok: false, error: fetchErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Group by fingerprint
  const buckets = new Map<string, {
    fingerprint: string;
    provider: string;
    endpoint: string;
    sample_message: string;
    occurrences: number;
    last_seen: string;
  }>();

  for (const row of failures || []) {
    const fp = fingerprint(String(row.error_message));
    const key = `${row.provider}::${fp}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.occurrences++;
      if (row.created_at > existing.last_seen) existing.last_seen = row.created_at;
    } else {
      buckets.set(key, {
        fingerprint: fp,
        provider: String(row.provider),
        endpoint: String(row.endpoint || ''),
        sample_message: String(row.error_message),
        occurrences: 1,
        last_seen: String(row.created_at),
      });
    }
  }

  // 3. For each bucket, check whether a matching open or fresh-resolved bug exists.
  // Skip 'ignore' severity entirely.
  const created: any[] = [];
  const skipped: any[] = [];

  for (const bucket of buckets.values()) {
    const sev = classifySeverity(bucket.sample_message);
    if (sev === 'ignore') {
      skipped.push({ ...bucket, reason: 'infrastructure-noise' });
      continue;
    }

    const title = `${bucket.provider} ${bucket.endpoint}: ${bucket.fingerprint.slice(0, 80)}`;

    // Check for existing bug with same title (proxy for fingerprint) created in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await sb
      .from('qa_bug_reports')
      .select('id, status, created_at')
      .eq('title', title)
      .gte('created_at', sevenDaysAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped.push({ title, reason: `duplicate-${existing[0].status}`, existing_id: existing[0].id });
      continue;
    }

    const description = [
      `**Provider**: ${bucket.provider}`,
      `**Endpoint**: ${bucket.endpoint}`,
      `**Occurrences (24h)**: ${bucket.occurrences}`,
      `**Last seen**: ${bucket.last_seen}`,
      ``,
      `**Sample error**:`,
      '```',
      bucket.sample_message.slice(0, 1500),
      '```',
    ].join('\n');

    const { data: inserted, error: insertErr } = await sb
      .from('qa_bug_reports')
      .insert({
        mission_name: 'bug-harvester',
        severity: sev,
        category: classifyCategory(bucket.provider, bucket.sample_message),
        title,
        description,
        status: 'open',
      })
      .select('id')
      .single();

    if (insertErr) {
      skipped.push({ title, reason: `insert-error: ${insertErr.message}` });
    } else {
      created.push({ id: inserted?.id, title, severity: sev, occurrences: bucket.occurrences });
    }
  }

  await recordHeartbeat({
    jobName: 'qa-bug-harvester',
    status: 'ok',
    durationMs: Date.now() - hbStart,
    expectedIntervalSeconds: 86400, // daily
  });

  return new Response(
    JSON.stringify({
      ok: true,
      summary: {
        scanned_failures: failures?.length ?? 0,
        unique_fingerprints: buckets.size,
        bugs_created: created.length,
        skipped: skipped.length,
      },
      created,
      skipped,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
