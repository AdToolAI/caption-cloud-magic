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
    // 1) Read token from secure database first, fallback to ENV
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    let PAGE_TOKEN = Deno.env.get('IG_PAGE_ACCESS_TOKEN');
    
    // Try to read from database first
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase
        .from('app_secrets')
        .select('encrypted_value')
        .eq('name', 'IG_PAGE_ACCESS_TOKEN')
        .single();
      
      if (!error && data?.encrypted_value) {
        PAGE_TOKEN = data.encrypted_value;
        console.log('Token loaded from secure database');
      } else {
        console.log('Token not found in database, using ENV fallback');
      }
    }
    
    const APP_ID = Deno.env.get('META_APP_ID');
    const APP_SECRET = Deno.env.get('META_APP_SECRET');
    const PAGE_ID = '797827560073785';
    const IG_USER_ID = Deno.env.get('IG_USER_ID') || '17841477402452109';

    if (!PAGE_TOKEN) {
      return json({
        ok: false,
        error: 'IG_PAGE_ACCESS_TOKEN nicht konfiguriert (Secret fehlt)',
      }, 500);
    }

    if (!APP_ID || !APP_SECRET) {
      console.warn('META_APP_ID oder META_APP_SECRET fehlen - Scope-Check limitiert');
    }

    console.log('Starting token debug/scope check...');

    // 1) Debug token to get validity, expiration, and scopes
    let debugInfo: any = null;
    if (APP_ID && APP_SECRET) {
      console.log('Fetching token metadata via debug_token...');
      const debugUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(PAGE_TOKEN)}&access_token=${APP_ID}|${APP_SECRET}`;
      
      const debugRes = await fetch(debugUrl);
      const debugData = await debugRes.json();

      if (!debugRes.ok || debugData.error) {
        const err = debugData.error || {};
        console.error('Debug token failed:', debugData);
        return json({
          ok: false,
          error: 'Token-Debug fehlgeschlagen',
          details: {
            code: err.code,
            type: err.type,
            message: err.message,
          }
        }, 400);
      }

      debugInfo = debugData.data || {};
      console.log('Token debug successful:', {
        is_valid: debugInfo.is_valid,
        expires_at: debugInfo.expires_at,
        scopes_count: debugInfo.scopes?.length,
      });
    }

    // 2) Check page-instagram link
    console.log('Checking page-instagram business account link...');
    const linkUrl = `https://graph.facebook.com/v24.0/${PAGE_ID}?fields=instagram_business_account&access_token=${encodeURIComponent(PAGE_TOKEN)}`;
    
    const linkRes = await fetch(linkUrl);
    const linkData = await linkRes.json();

    let linkedIgId = null;
    if (linkRes.ok && !linkData.error) {
      linkedIgId = linkData?.instagram_business_account?.id ?? null;
      console.log('Instagram business account linked:', linkedIgId);
    } else {
      console.warn('Could not verify page-instagram link:', linkData);
    }

    // 3) Required scopes check
    const requiredScopes = [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_metadata',
    ];

    const currentScopes = debugInfo?.scopes || [];
    const missingScopes = requiredScopes.filter(scope => !currentScopes.includes(scope));
    const hasAllScopes = missingScopes.length === 0;

    console.log('Scope check:', {
      current: currentScopes.length,
      required: requiredScopes.length,
      missing: missingScopes.length,
    });

    // 4) Calculate days until expiration
    let daysUntilExpiration = null;
    let expirationWarning = false;
    if (debugInfo?.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      const secondsUntilExpiration = debugInfo.expires_at - now;
      daysUntilExpiration = Math.floor(secondsUntilExpiration / (24 * 60 * 60));
      expirationWarning = daysUntilExpiration < 10;
      console.log(`Token expires in ${daysUntilExpiration} days (warning: ${expirationWarning})`);
    }

    return json({
      ok: true,
      token: {
        is_valid: debugInfo?.is_valid ?? null,
        expires_at: debugInfo?.expires_at ?? null,
        expires_at_readable: debugInfo?.expires_at 
          ? new Date(debugInfo.expires_at * 1000).toISOString() 
          : null,
        days_until_expiration: daysUntilExpiration,
        expiration_warning: expirationWarning,
        scopes: currentScopes,
        missing_scopes: missingScopes,
        has_all_required_scopes: hasAllScopes,
        issued_to: debugInfo?.application ?? null,
      },
      link: {
        page_id: PAGE_ID,
        instagram_business_account_id: linkedIgId,
        is_linked: linkedIgId === IG_USER_ID,
      },
      recommendations: expirationWarning || !hasAllScopes ? [
        expirationWarning ? '⚠️ Token läuft in weniger als 10 Tagen ab - erneuere ihn jetzt' : null,
        !hasAllScopes ? `⚠️ Fehlende Scopes: ${missingScopes.join(', ')}` : null,
      ].filter(Boolean) : [],
    });

  } catch (err: any) {
    console.error('Token debug error:', err);
    return json({
      ok: false,
      error: err?.message || 'Unerwarteter Fehler beim Token-Debug',
      details: {
        name: err?.name,
        stack: err?.stack?.substring(0, 500),
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
      'X-Op': 'token-debug-v1',
    },
  });
}
