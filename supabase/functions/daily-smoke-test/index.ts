import { corsHeaders } from '@supabase/supabase-js/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

interface SmokeTest {
  name: string;
  fn: () => Promise<{ status: 'pass' | 'fail' | 'skip'; latency_ms: number; error?: string; data?: unknown }>;
}

async function timeFetch(url: string, init?: RequestInit, timeoutMs = 10000) {
  const start = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const latency = Date.now() - start;
    return { ok: res.ok, status: res.status, latency, body: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: Array<Record<string, unknown>> = [];

  // Critical edge functions to ping (lightweight health checks)
  const criticalFunctions = [
    'health-alerter',
    'generate-caption',
    'generate-hooks',
    'generate-bio',
    'analyze-performance',
  ];

  const tests: SmokeTest[] = [
    // DB connectivity
    {
      name: 'db_connectivity',
      fn: async () => {
        const start = Date.now();
        const { error } = await supabase.from('profiles').select('id').limit(1);
        const latency = Date.now() - start;
        return error
          ? { status: 'fail' as const, latency_ms: latency, error: error.message }
          : { status: 'pass' as const, latency_ms: latency };
      },
    },
    // Auth endpoint
    {
      name: 'auth_endpoint',
      fn: async () => {
        const r = await timeFetch(`${SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: SUPABASE_ANON_KEY },
        });
        return r.ok
          ? { status: 'pass' as const, latency_ms: r.latency }
          : { status: 'fail' as const, latency_ms: r.latency, error: `HTTP ${r.status}: ${r.body.slice(0, 200)}` };
      },
    },
    // Storage endpoint
    {
      name: 'storage_endpoint',
      fn: async () => {
        const r = await timeFetch(`${SUPABASE_URL}/storage/v1/bucket`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        });
        return r.ok
          ? { status: 'pass' as const, latency_ms: r.latency }
          : { status: 'fail' as const, latency_ms: r.latency, error: `HTTP ${r.status}` };
      },
    },
  ];

  // Add edge function OPTIONS (CORS) preflight checks — lightweight, never charges credits
  for (const fn of criticalFunctions) {
    tests.push({
      name: `edge_${fn}`,
      fn: async () => {
        const r = await timeFetch(
          `${SUPABASE_URL}/functions/v1/${fn}`,
          {
            method: 'OPTIONS',
            headers: {
              Origin: 'https://smoketest.local',
              'Access-Control-Request-Method': 'POST',
            },
          },
          5000
        );
        // OPTIONS should return 200/204 if function exists and CORS works
        return r.ok || r.status === 204
          ? { status: 'pass' as const, latency_ms: r.latency }
          : { status: 'fail' as const, latency_ms: r.latency, error: `HTTP ${r.status}` };
      },
    });
  }

  // Run all tests
  for (const test of tests) {
    try {
      const result = await test.fn();
      results.push({
        test_name: test.name,
        test_type: 'smoke',
        status: result.status,
        latency_ms: result.latency_ms,
        error_message: result.error ?? null,
        response_data: result.data ?? null,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        test_name: test.name,
        test_type: 'smoke',
        status: 'fail',
        latency_ms: 0,
        error_message: msg,
      });
    }
  }

  // Persist all results
  const { error: insertErr } = await supabase
    .from('smoke_test_runs')
    .insert(results);

  if (insertErr) {
    console.error('Insert error:', insertErr);
  }

  const failed = results.filter((r) => r.status === 'fail').length;
  const passed = results.filter((r) => r.status === 'pass').length;

  return new Response(
    JSON.stringify({
      success: true,
      total: results.length,
      passed,
      failed,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
