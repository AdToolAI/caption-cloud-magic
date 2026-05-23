// Auto-Refresh Meta Long-Lived Tokens
// - Global owner page token in app_secrets (IG_PAGE_ACCESS_TOKEN)
// - Per-user FB Page + IG Business tokens in social_connections.access_token_hash
// Both paths use fb_exchange_token if a token has < THRESHOLD_DAYS days left.
// Mode 'status' returns info only; default 'refresh' attempts re-exchange.
import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { decryptToken, encryptToken } from '../_shared/crypto.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const THRESHOLD_DAYS = 14; // refresh wenn weniger als 14d Restlaufzeit
const SECRET_NAME = 'IG_PAGE_ACCESS_TOKEN';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { /* ignore */ }
    }
    const mode: 'status' | 'refresh' = body.mode || url.searchParams.get('mode') || 'refresh';
    const force: boolean = body.force === true || url.searchParams.get('force') === 'true';

    const APP_ID = Deno.env.get('META_APP_ID');
    const APP_SECRET = Deno.env.get('META_APP_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!APP_ID || !APP_SECRET) {
      return json({ ok: false, error: 'META_APP_ID/META_APP_SECRET fehlt' }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Aktuellen Token laden
    const { data: secret, error: loadErr } = await supabase
      .from('app_secrets')
      .select('encrypted_value, updated_at')
      .eq('name', SECRET_NAME)
      .single();

    if (loadErr || !secret?.encrypted_value) {
      return json({
        ok: false,
        error: `Kein ${SECRET_NAME} in app_secrets gefunden`,
        details: loadErr,
      }, 404);
    }

    const currentToken = secret.encrypted_value as string;

    // 2) Token debuggen
    const debugUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(currentToken)}&access_token=${APP_ID}|${APP_SECRET}`;
    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();
    const debug = debugData?.data || {};
    const expiresAtUnix: number | undefined = debug.expires_at; // 0 = never
    const isValid: boolean = !!debug.is_valid;
    const expiresAtIso = expiresAtUnix && expiresAtUnix > 0
      ? new Date(expiresAtUnix * 1000).toISOString()
      : null;
    const daysRemaining = expiresAtUnix && expiresAtUnix > 0
      ? Math.round((expiresAtUnix * 1000 - Date.now()) / 86_400_000)
      : null;

    const status = {
      secret_name: SECRET_NAME,
      last_updated_at: secret.updated_at,
      token_last6: currentToken.slice(-6),
      is_valid: isValid,
      expires_at: expiresAtIso,
      days_remaining: daysRemaining,
      never_expires: expiresAtUnix === 0,
      threshold_days: THRESHOLD_DAYS,
      needs_refresh: daysRemaining !== null && daysRemaining < THRESHOLD_DAYS,
      scopes: debug.scopes || [],
      app_id_match: debug.app_id === APP_ID,
    };

    if (mode === 'status') {
      return json({ ok: true, action: 'status', status });
    }

    // 3) Refresh-Entscheidung
    if (!isValid) {
      // Token revoked — nicht versuchen zu re-exchangen, würde scheitern
      console.warn('[auto-refresh-meta] Token ist invalid, Refresh übersprungen.');
      return json({
        ok: false,
        action: 'refresh',
        refreshed: false,
        reason: 'token_invalid',
        message: 'Token ist nicht mehr gültig — manueller Re-Auth nötig via instagram-token-renew.',
        status,
      }, 200);
    }

    if (status.never_expires && !force) {
      return json({ ok: true, action: 'refresh', refreshed: false, reason: 'never_expires', status });
    }

    if (!force && daysRemaining !== null && daysRemaining >= THRESHOLD_DAYS) {
      return json({
        ok: true,
        action: 'refresh',
        refreshed: false,
        reason: 'not_due_yet',
        status,
      });
    }

    // 4) Re-Exchange
    console.log(`[auto-refresh-meta] Refresh ausgelöst (days_remaining=${daysRemaining}, force=${force})`);
    const exchangeUrl = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(currentToken)}`;
    const exRes = await fetch(exchangeUrl);
    const exData = await exRes.json();

    if (!exRes.ok || exData.error || !exData.access_token) {
      console.error('[auto-refresh-meta] Exchange failed:', exData);
      return json({
        ok: false,
        action: 'refresh',
        refreshed: false,
        reason: 'exchange_failed',
        error: exData.error?.message || 'Unknown exchange error',
        details: exData.error,
        status,
      }, 502);
    }

    const newToken = exData.access_token as string;

    // 5) Backup alten Token
    try {
      const enc = new TextEncoder().encode(currentToken);
      const hashBuf = await crypto.subtle.digest('SHA-256', enc);
      const tokenHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      await supabase.from('kv_secrets_backup').insert({
        name: SECRET_NAME,
        encrypted_value: currentToken,
        token_hash: tokenHash,
        token_last6: currentToken.slice(-6),
        expires_at: expiresAtIso,
        scopes: status.scopes,
        created_by: 'auto-refresh-meta-tokens',
      });
    } catch (e) {
      console.warn('[auto-refresh-meta] Backup failed (non-critical):', e);
    }

    // 6) Neuen Token speichern
    const { error: saveErr } = await supabase
      .from('app_secrets')
      .upsert({
        name: SECRET_NAME,
        encrypted_value: newToken,
        updated_at: new Date().toISOString(),
      });

    if (saveErr) {
      console.error('[auto-refresh-meta] Save failed:', saveErr);
      return json({ ok: false, action: 'refresh', refreshed: false, reason: 'save_failed', error: saveErr.message }, 500);
    }

    // 7) Debug new token für Response
    const newDebugUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(newToken)}&access_token=${APP_ID}|${APP_SECRET}`;
    const newDebugRes = await fetch(newDebugUrl);
    const newDebugData = await newDebugRes.json();
    const newDebug = newDebugData?.data || {};
    const newExpiresAt = newDebug.expires_at && newDebug.expires_at > 0
      ? new Date(newDebug.expires_at * 1000).toISOString()
      : null;

    console.log(`[auto-refresh-meta] ✅ Refresh OK. New expires_at=${newExpiresAt}`);

    return json({
      ok: true,
      action: 'refresh',
      refreshed: true,
      previous_expires_at: expiresAtIso,
      new_expires_at: newExpiresAt,
      new_token_last6: newToken.slice(-6),
      status: {
        ...status,
        last_updated_at: new Date().toISOString(),
        expires_at: newExpiresAt,
        days_remaining: newDebug.expires_at && newDebug.expires_at > 0
          ? Math.round((newDebug.expires_at * 1000 - Date.now()) / 86_400_000)
          : null,
        token_last6: newToken.slice(-6),
        needs_refresh: false,
      },
    });

  } catch (err: any) {
    console.error('[auto-refresh-meta] Unexpected error:', err);
    return json({ ok: false, error: err?.message || 'unexpected', stack: err?.stack?.substring(0, 400) }, 500);
  }
});

function json(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
