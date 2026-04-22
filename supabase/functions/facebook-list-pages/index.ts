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

    // Always include instagram_business_account so we can flag IG-capable pages
    // even in facebook mode (cheap, single field).
    const fbResponse = await fetch(
      `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,category,picture{url},access_token,instagram_business_account&access_token=${accessToken}`
    );

    if (!fbResponse.ok) {
      const fbError = await fbResponse.json();
      console.error('Facebook API error:', fbError);
      return new Response(JSON.stringify({ error: 'Failed to fetch pages from Facebook', details: fbError }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const fbData = await fbResponse.json();

    let pages = (fbData.data || []).map((page: any) => ({
      id: page.id,
      name: page.name,
      category: page.category || 'Page',
      picture_url: page.picture?.data?.url || null,
      access_token: page.access_token,
      has_instagram: !!page.instagram_business_account?.id,
      instagram_business_account_id: page.instagram_business_account?.id || null,
    }));

    // For instagram mode: keep all pages but sort IG-capable ones first
    // (the dialog disables non-IG pages so the user understands which to pick).
    if (provider === 'instagram') {
      pages = pages.sort((a: any, b: any) => Number(b.has_instagram) - Number(a.has_instagram));
    }

    return new Response(JSON.stringify({ success: true, pages }), {
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
