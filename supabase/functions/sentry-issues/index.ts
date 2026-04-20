import { corsHeaders } from '@supabase/supabase-js/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const SENTRY_AUTH_TOKEN = Deno.env.get('SENTRY_AUTH_TOKEN');
const SENTRY_ORG_SLUG = Deno.env.get('SENTRY_ORG_SLUG');
const SENTRY_PROJECT_SLUG = Deno.env.get('SENTRY_PROJECT_SLUG');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: string;
  status: string;
  platform: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG_SLUG || !SENTRY_PROJECT_SLUG) {
      return new Response(
        JSON.stringify({
          error: 'Sentry credentials not configured',
          missing: {
            token: !SENTRY_AUTH_TOKEN,
            org: !SENTRY_ORG_SLUG,
            project: !SENTRY_PROJECT_SLUG,
          },
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? 'list';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // === RESOLVE ISSUE ===
    if (action === 'resolve') {
      const body = await req.json();
      const { issueId } = body;
      if (!issueId) {
        return new Response(JSON.stringify({ error: 'issueId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const sentryRes = await fetch(
        `https://sentry.io/api/0/issues/${issueId}/`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'resolved' }),
        }
      );

      if (!sentryRes.ok) {
        const text = await sentryRes.text();
        return new Response(
          JSON.stringify({ error: 'Sentry resolve failed', details: text }),
          { status: sentryRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('sentry_issues_cache')
        .update({ status: 'resolved' })
        .eq('sentry_issue_id', issueId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === SYNC + LIST ===
    const sentryRes = await fetch(
      `https://sentry.io/api/0/projects/${SENTRY_ORG_SLUG}/${SENTRY_PROJECT_SLUG}/issues/?statsPeriod=14d&limit=100&query=is:unresolved`,
      {
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
        },
      }
    );

    if (!sentryRes.ok) {
      const text = await sentryRes.text();
      return new Response(
        JSON.stringify({ error: 'Sentry fetch failed', status: sentryRes.status, details: text }),
        { status: sentryRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const issues: SentryIssue[] = await sentryRes.json();

    // Upsert into cache
    const cacheRows = issues.map((iss) => ({
      sentry_issue_id: iss.id,
      short_id: iss.shortId,
      title: iss.title,
      culprit: iss.culprit,
      level: iss.level,
      status: iss.status,
      platform: iss.platform,
      event_count: parseInt(iss.count ?? '0', 10),
      user_count: iss.userCount ?? 0,
      first_seen: iss.firstSeen,
      last_seen: iss.lastSeen,
      permalink: iss.permalink,
      metadata: iss.metadata ?? {},
      synced_at: new Date().toISOString(),
    }));

    if (cacheRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from('sentry_issues_cache')
        .upsert(cacheRows, { onConflict: 'sentry_issue_id' });
      if (upsertErr) {
        console.error('Cache upsert error:', upsertErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: issues.length,
        issues: cacheRows,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('sentry-issues error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
