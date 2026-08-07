// meta-oauth-diff
//
// Read-only: returns the structural diff between Meta connect attempts of the
// signed-in user, so a working account can be compared against a failing one.
// This function never calls Meta and never mutates anything.

import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AttemptRow {
  id: string;
  provider: string;
  created_at: string;
  callback_completed_at: string | null;
  requested_scopes: string[] | null;
  uses_config_id: boolean | null;
  auth_type: string | null;
  fb_user_id: string | null;
  fb_user_name: string | null;
  granted_scopes: string[] | null;
  declined_scopes: string[] | null;
  granular_scopes: unknown;
  me_accounts_raw: any;
  me_businesses_raw: any;
  debug_token_raw: any;
  pages_found_count: number | null;
}

function summarize(row: AttemptRow) {
  const granular = Array.isArray(row.granular_scopes) ? row.granular_scopes : [];
  const targetIds = new Set<string>();
  for (const g of granular as any[]) {
    for (const id of g?.target_ids ?? []) targetIds.add(String(id));
  }

  const accounts = row.me_accounts_raw?.body?.data;
  const businesses = row.me_businesses_raw?.body?.data;
  const businessPageIds = new Set<string>();
  for (const biz of Array.isArray(businesses) ? businesses : []) {
    for (const p of biz?.owned_pages?.data ?? []) if (p?.id) businessPageIds.add(String(p.id));
    for (const p of biz?.client_pages?.data ?? []) if (p?.id) businessPageIds.add(String(p.id));
  }

  return {
    id: row.id,
    provider: row.provider,
    created_at: row.created_at,
    completed: !!row.callback_completed_at,
    fb_user_id: row.fb_user_id,
    fb_user_name: row.fb_user_name,
    uses_config_id: row.uses_config_id,
    auth_type: row.auth_type,
    requested_scopes: row.requested_scopes ?? [],
    granted_scopes: row.granted_scopes ?? [],
    declined_scopes: row.declined_scopes ?? [],
    missing_scopes: (row.requested_scopes ?? []).filter(
      (s) => !(row.granted_scopes ?? []).includes(s),
    ),
    granular_scope_names: (granular as any[]).map((g) => g?.scope).filter(Boolean),
    granular_target_ids: [...targetIds],
    granular_target_id_count: targetIds.size,
    me_accounts_status: row.me_accounts_raw?.http_status ?? null,
    me_accounts_error: row.me_accounts_raw?.body?.error?.message ?? null,
    me_accounts_page_ids: Array.isArray(accounts) ? accounts.map((p: any) => String(p.id)) : [],
    me_accounts_count: Array.isArray(accounts) ? accounts.length : 0,
    me_businesses_status: row.me_businesses_raw?.http_status ?? null,
    me_businesses_error: row.me_businesses_raw?.body?.error?.message ?? null,
    me_businesses_count: Array.isArray(businesses) ? businesses.length : 0,
    business_page_ids: [...businessPageIds],
    token_type: row.debug_token_raw?.body?.data?.type ?? null,
    token_app_id: row.debug_token_raw?.body?.data?.app_id ?? null,
    token_is_valid: row.debug_token_raw?.body?.data?.is_valid ?? null,
    debug_token_error: row.debug_token_raw?.body?.error?.message ?? row.debug_token_raw?.error ?? null,
  };
}

type Summary = ReturnType<typeof summarize>;

const COMPARE_FIELDS: (keyof Summary)[] = [
  'uses_config_id',
  'auth_type',
  'requested_scopes',
  'granted_scopes',
  'declined_scopes',
  'missing_scopes',
  'granular_scope_names',
  'granular_target_id_count',
  'me_accounts_status',
  'me_accounts_error',
  'me_accounts_count',
  'me_businesses_status',
  'me_businesses_error',
  'me_businesses_count',
  'business_page_ids',
  'token_type',
  'token_app_id',
  'token_is_valid',
  'debug_token_error',
];

function norm(v: unknown) {
  return Array.isArray(v) ? [...v].map(String).sort().join(', ') : v === null || v === undefined ? '' : String(v);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: { attempt_a?: string; attempt_b?: string; provider?: string } = {};
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}));
    }

    let query = supabase
      .from('meta_oauth_diagnostics')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (body.provider) query = query.eq('provider', body.provider);

    const { data: rows, error } = await query;
    if (error) throw error;

    const attempts = ((rows ?? []) as AttemptRow[]).map(summarize);

    // Default comparison: newest completed attempt per distinct Meta user.
    const pickById = (id?: string) => attempts.find((a) => a.id === id);
    let a = pickById(body.attempt_a);
    let b = pickById(body.attempt_b);

    if (!a || !b) {
      const completed = attempts.filter((x) => x.completed);
      const byUser = new Map<string, Summary>();
      for (const attempt of completed) {
        const key = attempt.fb_user_id ?? attempt.id;
        if (!byUser.has(key)) byUser.set(key, attempt);
      }
      const distinct = [...byUser.values()];
      a = a ?? distinct[0];
      b = b ?? distinct[1] ?? (completed[1] && completed[1].id !== a?.id ? completed[1] : undefined);
    }

    const diff = a && b
      ? COMPARE_FIELDS.map((field) => ({
          field,
          a: norm((a as Summary)[field]),
          b: norm((b as Summary)[field]),
          equal: norm((a as Summary)[field]) === norm((b as Summary)[field]),
        }))
      : [];

    return new Response(
      JSON.stringify({
        attempts,
        attempt_a: a ?? null,
        attempt_b: b ?? null,
        diff,
        differing_fields: diff.filter((d) => !d.equal).map((d) => d.field),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    console.error('[meta-oauth-diff] error:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
