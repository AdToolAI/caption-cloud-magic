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

    // Get Facebook connection
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'facebook')
      .maybeSingle();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'No Facebook connection found' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Decrypt access token
    const accessToken = await decryptToken(connection.access_token_hash);

    // Call Facebook Graph API to list pages
    const fbResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,category,picture{url},access_token&access_token=${accessToken}`
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

    const pages = (fbData.data || []).map((page: any) => ({
      id: page.id,
      name: page.name,
      category: page.category || 'Page',
      picture_url: page.picture?.data?.url || null,
      access_token: page.access_token,
    }));

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
