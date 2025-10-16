import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json(null, 204);
  }

  try {
    const { shortUserToken } = await req.json();
    if (!shortUserToken) {
      return json({ ok: false, error: 'shortUserToken fehlt im Request Body' }, 400);
    }

    const APP_ID = Deno.env.get('META_APP_ID');
    const APP_SECRET = Deno.env.get('META_APP_SECRET');
    const PAGE_ID = '797827560073785';

    if (!APP_ID || !APP_SECRET) {
      console.error('META_APP_ID oder META_APP_SECRET nicht konfiguriert');
      return json({ 
        ok: false, 
        error: 'App-Credentials fehlen (META_APP_ID/META_APP_SECRET Secrets)' 
      }, 500);
    }

    console.log('Starting token renewal process...');

    // 1) Exchange short-lived user token for long-lived user token
    console.log('Step 1: Exchanging short-lived token for long-lived token...');
    const llTokenUrl = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortUserToken)}`;
    
    const llTokenRes = await fetch(llTokenUrl);
    const llTokenData = await llTokenRes.json();

    if (!llTokenRes.ok || llTokenData.error) {
      console.error('Long-lived token exchange failed:', llTokenData);
      const err = llTokenData.error || {};
      return json({
        ok: false,
        error: 'Token-Exchange fehlgeschlagen',
        details: {
          step: 'exchange_token',
          code: err.code,
          type: err.type,
          message: err.message,
        }
      }, 400);
    }

    const longLivedUserToken = llTokenData.access_token;
    console.log('Long-lived user token obtained successfully');

    // 2) Get page token from long-lived user token
    console.log('Step 2: Fetching page token...');
    const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(longLivedUserToken)}`;
    
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (!pagesRes.ok || pagesData.error) {
      console.error('Pages fetch failed:', pagesData);
      const err = pagesData.error || {};
      return json({
        ok: false,
        error: 'Page-Daten konnten nicht geladen werden',
        details: {
          step: 'fetch_pages',
          code: err.code,
          type: err.type,
          message: err.message,
        }
      }, 400);
    }

    const page = (pagesData.data || []).find((p: any) => p.id === PAGE_ID);
    if (!page) {
      console.error(`Page ${PAGE_ID} not found in user's pages:`, pagesData.data);
      return json({
        ok: false,
        error: `Facebook Page ${PAGE_ID} nicht gefunden. Stelle sicher, dass du Admin-Rechte für diese Seite hast.`,
        details: {
          step: 'find_page',
          available_pages: pagesData.data?.map((p: any) => ({ id: p.id, name: p.name })),
        }
      }, 404);
    }

    const newPageToken = page.access_token;
    console.log(`Page token obtained for page: ${page.name}`);

    // 3) Save token to secure database
    console.log('Step 3: Saving token to secure storage...');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase credentials missing');
      return json({
        ok: false,
        saved: false,
        error: 'Server-Konfiguration fehlt (SUPABASE_URL/SERVICE_ROLE_KEY)'
      }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { error: saveError } = await supabase
      .from('app_secrets')
      .upsert({
        name: 'IG_PAGE_ACCESS_TOKEN',
        encrypted_value: newPageToken,
        updated_at: new Date().toISOString()
      });

    if (saveError) {
      console.error('Failed to save token to database:', saveError);
      return json({
        ok: false,
        saved: false,
        error: 'Token konnte nicht gespeichert werden',
        details: saveError
      }, 500);
    }

    console.log('Token saved successfully to database');

    // 4) Debug token to get expiration and scopes
    console.log('Step 4: Debugging token for metadata...');
    const debugUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(newPageToken)}&access_token=${APP_ID}|${APP_SECRET}`;
    
    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();

    if (!debugRes.ok || debugData.error) {
      console.warn('Debug token failed (non-critical):', debugData);
    }

    const debugInfo = debugData.data || {};
    console.log('Token renewal complete:', {
      is_valid: debugInfo.is_valid,
      expires_at: debugInfo.expires_at,
      scopes_count: debugInfo.scopes?.length,
    });

    // Return success with debug info (token is NOT returned for security)
    return json({
      ok: true,
      saved: true,
      page_token_renewed: true,
      debug: {
        is_valid: debugInfo.is_valid ?? null,
        expires_at: debugInfo.expires_at ?? null,
        scopes: debugInfo.scopes ?? [],
        issued_to_app: debugInfo.application ?? null,
      },
      page_info: {
        id: page.id,
        name: page.name,
      }
    });

  } catch (err: any) {
    console.error('Token renewal error:', err);
    return json({
      ok: false,
      error: err?.message || 'Unerwarteter Fehler bei Token-Erneuerung',
      details: {
        name: err?.name,
        stack: err?.stack?.substring(0, 500), // truncate stack
      }
    }, 500);
  }
});

function json(payload: any, status = 200) {
  return new Response(payload ? JSON.stringify(payload) : null, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Op': 'token-renew-v2',
    },
  });
}
