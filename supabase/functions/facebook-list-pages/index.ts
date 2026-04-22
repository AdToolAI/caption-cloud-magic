import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken } from '../_shared/crypto.ts';
import {
  discoverMetaPagesWithDiagnostics,
  classifyDiscoveryResult,
  fetchMetaGrantedScopes,
  requiredPageScopesFor,
} from '../_shared/meta-page-discovery.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    let provider: 'facebook' | 'instagram' = 'facebook';
    try {
      const body = await req.json();
      if (body?.provider === 'instagram' || body?.provider === 'facebook') {
        provider = body.provider;
      }
    } catch (_) {
      // body optional
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .maybeSingle();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: `No ${provider} connection found` }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await decryptToken(connection.access_token_hash);

    // 1. Granted permissions
    const { granted, declined } = await fetchMetaGrantedScopes(accessToken);
    const required = requiredPageScopesFor(provider);
    const missingScopes = required.filter((s) => !granted.includes(s));

    // 2. Real per-page verification with diagnostics.
    let pages;
    let diagnostics;
    try {
      const result = await discoverMetaPagesWithDiagnostics(accessToken, {
        verifyInstagram: provider === 'instagram',
      });
      pages = result.pages;
      diagnostics = result.diagnostics;
    } catch (e: any) {
      console.error('[facebook-list-pages] discoverMetaPages failed:', e);
      return new Response(JSON.stringify({
        error: 'Failed to fetch pages from Facebook',
        details: e?.message,
        status: 'fetch_failed',
        granted_scopes: granted,
        declined_scopes: declined,
        missing_scopes: missingScopes,
      }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const resultStatus = classifyDiscoveryResult(pages, provider, missingScopes, diagnostics);

    // For Instagram: keep all pages but sort IG-capable ones first.
    if (provider === 'instagram') {
      pages = pages.sort((a, b) => Number(b.has_instagram) - Number(a.has_instagram));
    }

    // Persist diagnostics to account_metadata so the UI / support can see why
    // discovery yielded what it did, without re-running it.
    try {
      await supabase
        .from('social_connections')
        .update({
          account_metadata: {
            ...(connection.account_metadata || {}),
            meta_page_discovery_status: resultStatus,
            meta_pages_found_count: diagnostics.pages_found_count,
            meta_verified_instagram_count: diagnostics.verified_instagram_count,
            meta_page_verify_failures: diagnostics.page_verify_failures,
            meta_pages_with_token_count: diagnostics.pages_with_token_count,
            meta_pages_with_inline_ig_count: diagnostics.pages_with_inline_ig_count,
            meta_list_error: diagnostics.list_error,
            meta_last_discovery_at: diagnostics.ran_at,
            granted_scopes: granted,
            declined_scopes: declined,
            missing_page_scopes: missingScopes,
          },
        })
        .eq('id', connection.id);
    } catch (persistErr) {
      console.warn('[facebook-list-pages] failed to persist diagnostics:', persistErr);
    }

    return new Response(JSON.stringify({
      success: true,
      pages,
      status: resultStatus,
      granted_scopes: granted,
      declined_scopes: declined,
      missing_scopes: missingScopes,
      diagnostics,
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('facebook-list-pages error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
