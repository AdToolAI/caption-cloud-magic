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
    const { shortUserToken, tokenType } = await req.json();
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
    console.log('Token type hint from client:', tokenType || 'none');

    let isPageToken = false;
    let tokenTypeSource = 'unknown';

    // Priorisierung: Client-Hint > Auto-Detection
    if (tokenType === 'page') {
      console.log('✅ Client specified: Page Token - using direct mode');
      isPageToken = true;
      tokenTypeSource = 'client_hint';
    } else if (tokenType === 'user') {
      console.log('✅ Client specified: User Token - using conversion mode');
      isPageToken = false;
      tokenTypeSource = 'client_hint';
    } else {
      // Fallback: Auto-Detection via debug_token
      console.log('⚠️ No token type specified - auto-detecting...');
      
      const detectUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(shortUserToken)}&access_token=${APP_ID}|${APP_SECRET}`;
      const detectRes = await fetch(detectUrl);
      const detectData = await detectRes.json();

      if (!detectRes.ok || detectData.error) {
        console.error('Token detection failed:', detectData);
        return json({
          ok: false,
          error: 'Token-Validierung fehlgeschlagen',
          details: {
            step: 'detect_token_type',
            message: detectData.error?.message || 'Token ungültig',
          }
        }, 400);
      }

      const tokenInfo = detectData.data || {};
      const tokenTypeDetected = tokenInfo.type;
      isPageToken = tokenTypeDetected === 'PAGE';
      tokenTypeSource = 'auto_detect';
      
      console.log(`Token type detected: ${tokenTypeDetected} (is_page_token: ${isPageToken})`);
    }

    console.log(`📋 Token renewal mode: ${isPageToken ? 'PAGE' : 'USER'} (source: ${tokenTypeSource})`);

    let newPageToken: string;
    let pageInfo: any = null;

    // BRANCH: Direct Page Token vs. User Token → Page Token
    if (isPageToken) {
      // MODE 1: Direct Page Token Input
      console.log('Mode: Direct Page Token Renewal');
      console.log('Step 1: Converting short-lived Page Token to long-lived...');
      
      const llTokenUrl = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortUserToken)}`;
      
      const llTokenRes = await fetch(llTokenUrl);
      const llTokenData = await llTokenRes.json();

      if (!llTokenRes.ok || llTokenData.error) {
        console.error('Page token exchange failed:', llTokenData);
        const err = llTokenData.error || {};
        return json({
          ok: false,
          error: 'Page Token konnte nicht in Long-Lived umgewandelt werden',
          details: {
            step: 'exchange_page_token',
            code: err.code,
            type: err.type,
            message: err.message,
          }
        }, 400);
      }

      newPageToken = llTokenData.access_token;
      console.log('Long-lived Page Token obtained successfully');
      
      // Get page info from token
      try {
        const pageInfoUrl = `https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${encodeURIComponent(newPageToken)}`;
        const pageInfoRes = await fetch(pageInfoUrl);
        const pageInfoData = await pageInfoRes.json();
        if (pageInfoRes.ok && pageInfoData.id) {
          pageInfo = { id: pageInfoData.id, name: pageInfoData.name || 'Unknown' };
        }
      } catch (e) {
        console.warn('Could not fetch page info:', e);
      }
      
    } else {
      // MODE 2: User Token → Page Token Conversion
      console.log('Mode: User Token → Page Token Conversion');
      
      // 1) Exchange short-lived user token for long-lived user token
      console.log('Step 1: Exchanging short-lived User Token for long-lived...');
      const llTokenUrl = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortUserToken)}`;
      
      const llTokenRes = await fetch(llTokenUrl);
      const llTokenData = await llTokenRes.json();

      if (!llTokenRes.ok || llTokenData.error) {
        console.error('Long-lived user token exchange failed:', llTokenData);
        const err = llTokenData.error || {};
        return json({
          ok: false,
          error: 'User Token-Exchange fehlgeschlagen',
          details: {
            step: 'exchange_user_token',
            code: err.code,
            type: err.type,
            message: err.message,
          }
        }, 400);
      }

      const longLivedUserToken = llTokenData.access_token;
      console.log('Long-lived User Token obtained successfully');

      // 2) Get page token from long-lived user token
      console.log('Step 2: Fetching Pages via /me/accounts...');
      const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(longLivedUserToken)}`;
      
      const pagesRes = await fetch(pagesUrl);
      const pagesData = await pagesRes.json();

      if (!pagesRes.ok || pagesData.error) {
        console.error('Pages fetch failed:', pagesData);
        const err = pagesData.error || {};
        
        // Special error message for missing pages_show_list permission
        if (err.code === 100 || err.message?.includes('accounts')) {
          return json({
            ok: false,
            error: 'Keine Berechtigung für /me/accounts. Verwende stattdessen einen Page Token!',
            details: {
              step: 'fetch_pages',
              code: err.code,
              type: err.type,
              message: err.message,
              hint: 'Gehe zu Graph API Explorer → "Get Page Access Token" wählen → Token kopieren und im Dialog "Page Token" auswählen'
            }
          }, 400);
        }
        
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

      newPageToken = page.access_token;
      pageInfo = { id: page.id, name: page.name };
      console.log('Page token obtained successfully');
    }

    // 3) Save token to secure database
    console.log('Step 3: Backing up old token...');
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
    
    // Backup old token before overwriting
    let backupCreated = false;
    try {
      const { data: oldSecret } = await supabase
        .from('app_secrets')
        .select('encrypted_value')
        .eq('name', 'IG_PAGE_ACCESS_TOKEN')
        .single();
      
      if (oldSecret?.encrypted_value) {
        const oldToken = oldSecret.encrypted_value;
        console.log('Old token found, creating backup...');
        
        // Get old token metadata via debug
        let oldScopes = null;
        let oldExpiresAt = null;
        try {
          const oldDebugUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(oldToken)}&access_token=${APP_ID}|${APP_SECRET}`;
          const oldDebugRes = await fetch(oldDebugUrl);
          const oldDebugData = await oldDebugRes.json();
          if (oldDebugRes.ok && oldDebugData.data) {
            oldScopes = oldDebugData.data.scopes || null;
            oldExpiresAt = oldDebugData.data.expires_at ? new Date(oldDebugData.data.expires_at * 1000).toISOString() : null;
          }
        } catch (e) {
          console.warn('Could not fetch old token metadata:', e);
        }
        
        // Create SHA256 hash
        const encoder = new TextEncoder();
        const data = encoder.encode(oldToken);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Insert backup
        const { error: backupError } = await supabase
          .from('kv_secrets_backup')
          .insert({
            name: 'IG_PAGE_ACCESS_TOKEN',
            encrypted_value: oldToken,
            token_hash: tokenHash,
            token_last6: oldToken.slice(-6),
            scopes: oldScopes,
            expires_at: oldExpiresAt,
            created_by: 'token-renew'
          });
        
        if (backupError) {
          console.error('Backup failed (non-critical):', backupError);
        } else {
          backupCreated = true;
          console.log('Backup created successfully');
        }
      }
    } catch (e) {
      console.error('Error during backup (non-critical):', e);
    }
    
    // Save new token
    console.log('Step 4: Saving new token to secure storage...');
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

    // 5) Debug token to get expiration and scopes
    console.log('Step 5: Debugging token for metadata...');
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
      backup_created: backupCreated,
      page_token_renewed: true,
      renewal_mode: isPageToken ? 'direct_page_token' : 'user_to_page_token',
      debug: {
        is_valid: debugInfo.is_valid ?? null,
        expires_at: debugInfo.expires_at ?? null,
        scopes: debugInfo.scopes ?? [],
        issued_to_app: debugInfo.application ?? null,
      },
      page_info: pageInfo || { id: 'unknown', name: 'Unknown Page' }
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
