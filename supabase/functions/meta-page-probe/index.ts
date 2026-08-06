// meta-page-probe — read-only Meta Graph diagnostics.
//
// Purpose: when facebook-list-pages reports 0 pages WITHOUT an error, this
// function shows the raw Graph responses so the actual cause is visible:
//   - debug_token.granular_scopes[].target_ids  (which assets Meta bound to the token)
//   - /me/accounts (raw, incl. empty data + paging)
//   - /me/businesses (+ owned_pages / client_pages)
//   - /{page_id} for an explicitly supplied page id
//   - /me/permissions
//
// It never returns access tokens.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptToken } from '../_shared/crypto.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GRAPH = 'https://graph.facebook.com/v24.0';

interface ProbeStep {
  step: string;
  url: string;
  status: number | null;
  ok: boolean;
  body: unknown;
  error?: string;
}

function redact(url: string): string {
  return url.replace(/access_token=[^&]+/g, 'access_token=***').replace(/input_token=[^&]+/g, 'input_token=***');
}

async function probe(step: string, url: string): Promise<ProbeStep> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    let body: unknown = text.slice(0, 4000);
    try {
      body = JSON.parse(text);
    } catch (_) {
      // keep as text
    }
    return { step, url: redact(url), status: res.status, ok: res.ok, body };
  } catch (e) {
    return {
      step,
      url: redact(url),
      status: null,
      ok: false,
      body: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const jsonRes = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    console.log('[meta-page-probe] auth header present:', !!authHeader);
    if (!authHeader) return jsonRes({ error: 'Unauthorized', reason: 'missing_authorization_header' }, 401);

    let provider: 'facebook' | 'instagram' = 'instagram';
    let pageIdHint: string | null = null;
    try {
      const body = await req.json();
      if (body?.provider === 'facebook' || body?.provider === 'instagram') provider = body.provider;
      if (typeof body?.page_id === 'string' && /^\d{5,25}$/.test(body.page_id)) pageIdHint = body.page_id;
    } catch (_) {
      // body optional
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) return jsonRes({ error: 'Unauthorized' }, 401);

    const { data: connection } = await supabase
      .from('social_connections')
      .select('id, access_token_hash, account_metadata')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .maybeSingle();

    if (!connection) return jsonRes({ error: `No ${provider} connection found`, provider }, 404);

    let token: string;
    try {
      token = await decryptToken(connection.access_token_hash);
    } catch (e) {
      return jsonRes({ error: 'token_decrypt_failed', details: e instanceof Error ? e.message : String(e) }, 500);
    }

    const appId = Deno.env.get('META_APP_ID');
    const appSecret = Deno.env.get('META_APP_SECRET');
    const steps: ProbeStep[] = [];

    // 1) debug_token → granular_scopes.target_ids is the decisive evidence
    let granularPageIds: string[] = [];
    let granularIgIds: string[] = [];
    if (appId && appSecret) {
      const dbg = await probe(
        'debug_token',
        `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${appId}|${appSecret}`,
      );
      steps.push(dbg);
      const granular = (dbg.body as any)?.data?.granular_scopes;
      if (Array.isArray(granular)) {
        for (const g of granular) {
          const ids: string[] = Array.isArray(g?.target_ids) ? g.target_ids : [];
          if (typeof g?.scope === 'string' && g.scope.startsWith('instagram_')) {
            granularIgIds.push(...ids);
          } else {
            granularPageIds.push(...ids);
          }
        }
        granularPageIds = [...new Set(granularPageIds)];
        granularIgIds = [...new Set(granularIgIds)];
      }
    } else {
      steps.push({
        step: 'debug_token',
        url: `${GRAPH}/debug_token`,
        status: null,
        ok: false,
        body: null,
        error: 'META_APP_ID / META_APP_SECRET not configured',
      });
    }

    // 2) /me/permissions
    steps.push(await probe('me_permissions', `${GRAPH}/me/permissions?access_token=${encodeURIComponent(token)}`));

    // 3) /me/accounts raw
    steps.push(await probe(
      'me_accounts',
      `${GRAPH}/me/accounts?fields=id,name,category,access_token,instagram_business_account,connected_instagram_account&limit=100&access_token=${encodeURIComponent(token)}`,
    ));

    // 4) /me/businesses (+ owned/client pages)
    const biz = await probe('me_businesses', `${GRAPH}/me/businesses?fields=id,name&access_token=${encodeURIComponent(token)}`);
    steps.push(biz);
    const businesses = (biz.body as any)?.data;
    if (Array.isArray(businesses)) {
      for (const b of businesses.slice(0, 3)) {
        if (!b?.id) continue;
        steps.push(await probe(
          `business_${b.id}_owned_pages`,
          `${GRAPH}/${b.id}/owned_pages?fields=id,name,instagram_business_account&limit=50&access_token=${encodeURIComponent(token)}`,
        ));
        steps.push(await probe(
          `business_${b.id}_client_pages`,
          `${GRAPH}/${b.id}/client_pages?fields=id,name,instagram_business_account&limit=50&access_token=${encodeURIComponent(token)}`,
        ));
      }
    }

    // 5) direct page lookups: granular target ids + explicit hint
    const pageIds = [...new Set([...granularPageIds, ...(pageIdHint ? [pageIdHint] : [])])];
    for (const pid of pageIds.slice(0, 5)) {
      steps.push(await probe(
        `page_${pid}`,
        `${GRAPH}/${pid}?fields=id,name,category,instagram_business_account,connected_instagram_account,access_token&access_token=${encodeURIComponent(token)}`,
      ));
    }

    // 6) direct IG lookups from granular scopes
    for (const igid of granularIgIds.slice(0, 5)) {
      steps.push(await probe(
        `ig_${igid}`,
        `${GRAPH}/${igid}?fields=id,username,name&access_token=${encodeURIComponent(token)}`,
      ));
    }

    const meAccountsStep = steps.find((s) => s.step === 'me_accounts');
    const meAccountsCount = Array.isArray((meAccountsStep?.body as any)?.data)
      ? (meAccountsStep!.body as any).data.length
      : 0;

    const summary = {
      provider,
      me_accounts_count: meAccountsCount,
      granular_page_ids: granularPageIds,
      granular_instagram_ids: granularIgIds,
      businesses_count: Array.isArray(businesses) ? businesses.length : 0,
      verdict:
        meAccountsCount > 0
          ? 'me_accounts_returns_pages'
          : granularPageIds.length > 0
            ? 'asset_scoped_token_use_granular_ids'
            : Array.isArray(businesses) && businesses.length > 0
              ? 'pages_behind_business_portfolio'
              : 'no_pages_visible_to_token',
    };

    return jsonRes({ success: true, summary, steps, probed_at: new Date().toISOString() });
  } catch (error) {
    console.error('[meta-page-probe] failed:', error);
    return jsonRes({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
