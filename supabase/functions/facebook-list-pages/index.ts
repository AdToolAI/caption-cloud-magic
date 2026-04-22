import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken } from '../_shared/crypto.ts';
import {
  discoverMetaPages,
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

    // 2. Real per-page verification (this is the actual bugfix).
    let pages;
    try {
      pages = await discoverMetaPages(accessToken, {
        verifyInstagram: provider === 'instagram',
      });
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

    const resultStatus = classifyDiscoveryResult(pages, provider, missingScopes);

    // For Instagram: keep all pages but sort IG-capable ones first.
    if (provider === 'instagram') {
      pages = pages.sort((a, b) => Number(b.has_instagram) - Number(a.has_instagram));
    }

    return new Response(JSON.stringify({
      success: true,
      pages,
      status: resultStatus,
      granted_scopes: granted,
      declined_scopes: declined,
      missing_scopes: missingScopes,
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
