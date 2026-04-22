import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken } from '../_shared/crypto.ts';

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

    // Optional body: { provider: 'facebook' | 'instagram' }
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

    // Verify user
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

    // Get the Meta connection for this provider (instagram OR facebook).
    // Both providers share the same Meta user grant.
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

    // Decrypt the user access token
    const accessToken = await decryptToken(connection.access_token_hash);

    // 1. Check granted permissions to detect missing page scopes upfront.
    let grantedScopes: string[] = [];
    let declinedScopes: string[] = [];
    try {
      const permRes = await fetch(
        `https://graph.facebook.com/v24.0/me/permissions?access_token=${accessToken}`
      );
      if (permRes.ok) {
        const permJson = await permRes.json();
        for (const p of permJson?.data ?? []) {
          if (p.status === 'granted') grantedScopes.push(p.permission);
          else declinedScopes.push(p.permission);
        }
      }
    } catch (e) {
      console.warn('[facebook-list-pages] /me/permissions failed:', e);
    }

    const requiredPageScopes = provider === 'instagram'
      ? ['pages_show_list', 'instagram_basic']
      : ['pages_show_list', 'pages_read_engagement'];
    const missingScopes = requiredPageScopes.filter((s) => !grantedScopes.includes(s));

    // 2. Fetch pages. Include both classic and alternative IG link fields.
    const fbResponse = await fetch(
      `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,category,picture{url},access_token,instagram_business_account,connected_instagram_account&access_token=${accessToken}`
    );

    if (!fbResponse.ok) {
      const fbError = await fbResponse.json();
      console.error('Facebook API error:', fbError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch pages from Facebook',
        details: fbError,
        status: 'fetch_failed',
        granted_scopes: grantedScopes,
        declined_scopes: declinedScopes,
        missing_scopes: missingScopes,
      }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const fbData = await fbResponse.json();

    let pages = (fbData.data || []).map((page: any) => {
      const igId = page.instagram_business_account?.id
        || page.connected_instagram_account?.id
        || null;
      return {
        id: page.id,
        name: page.name,
        category: page.category || 'Page',
        picture_url: page.picture?.data?.url || null,
        access_token: page.access_token,
        has_instagram: !!igId,
        instagram_business_account_id: igId,
      };
    });

    // Classify the result so the UI can show a precise message.
    let resultStatus: string;
    if (missingScopes.length > 0 && pages.length === 0) {
      resultStatus = 'no_pages_access';
    } else if (pages.length === 0) {
      resultStatus = 'no_pages_found';
    } else if (provider === 'instagram') {
      const igCount = pages.filter((p: any) => p.has_instagram).length;
      if (igCount === 0) resultStatus = 'pages_found_but_no_instagram_link';
      else if (igCount === 1) resultStatus = 'single_instagram_page';
      else resultStatus = 'multiple_instagram_pages';
    } else {
      resultStatus = pages.length === 1 ? 'single_page' : 'multiple_pages';
    }

    // For instagram mode: keep all pages but sort IG-capable ones first
    // (the dialog disables non-IG pages so the user understands which to pick).
    if (provider === 'instagram') {
      pages = pages.sort((a: any, b: any) => Number(b.has_instagram) - Number(a.has_instagram));
    }

    return new Response(JSON.stringify({
      success: true,
      pages,
      status: resultStatus,
      granted_scopes: grantedScopes,
      declined_scopes: declinedScopes,
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
