// Meta OAuth diagnostics recorder.
//
// Purpose: capture a raw, structural record of EVERY Meta connect attempt so a
// working account can be diffed against a failing one. Pure measurement — this
// module never changes the OAuth flow.
//
// Nothing token-bearing is ever persisted: every response is redacted before
// it is written.

const GRAPH_VERSION = 'v24.0';

const TOKEN_KEYS = new Set([
  'access_token',
  'page_access_token',
  'refresh_token',
  'input_token',
  'client_secret',
  'code',
]);

/** Recursively strip token-like values from an arbitrary Graph API payload. */
export function redactTokens(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[max_depth]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactTokens(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = TOKEN_KEYS.has(k) ? (v ? '[redacted]' : null) : redactTokens(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Remove access_token query params from a dialog URL before storing it. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ['access_token', 'client_secret']) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '[redacted]');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export interface StartRecord {
  userId: string;
  provider: string;
  stateKey: string;
  requestedScopes: string[];
  dialogUrl: string;
  usesConfigId: boolean;
  authType: string | null;
}

/**
 * Write the "before consent" half of the record. Never throws — diagnostics
 * must not be able to break a connect attempt.
 */
export async function recordOAuthStart(
  supabase: any,
  rec: StartRecord,
): Promise<void> {
  try {
    const { error } = await supabase.from('meta_oauth_diagnostics').insert({
      user_id: rec.userId,
      provider: rec.provider,
      state_key: rec.stateKey,
      requested_scopes: rec.requestedScopes,
      dialog_url: redactUrl(rec.dialogUrl),
      uses_config_id: rec.usesConfigId,
      auth_type: rec.authType,
    });
    if (error) console.warn('[meta-oauth-diagnostics] start insert failed:', error.message);
  } catch (e) {
    console.warn('[meta-oauth-diagnostics] start insert threw:', e);
  }
}

async function graphJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 1000) };
    }
    return { http_status: res.status, body: redactTokens(parsed) };
  } catch (e: any) {
    return { http_status: null, error: e?.message || String(e) };
  }
}

export interface CallbackMeasurement {
  fb_user_id: string | null;
  fb_user_name: string | null;
  granted_scopes: string[];
  declined_scopes: string[];
  granular_scopes: unknown;
  debug_token_raw: unknown;
  me_accounts_raw: unknown;
  me_businesses_raw: unknown;
  pages_found_count: number;
}

/**
 * Read-only probe of what Meta actually bound to the freshly issued token.
 * Runs five Graph calls; every failure is captured instead of thrown.
 */
export async function measureMetaToken(userAccessToken: string): Promise<CallbackMeasurement> {
  const appId = Deno.env.get('META_APP_ID');
  const appSecret = Deno.env.get('META_APP_SECRET');
  const t = encodeURIComponent(userAccessToken);

  const [me, permissions, debugToken, accounts, businesses] = await Promise.all([
    graphJson(`https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name&access_token=${t}`),
    graphJson(`https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?access_token=${t}`),
    appId && appSecret
      ? graphJson(
          `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${t}` +
            `&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
        )
      : Promise.resolve({ http_status: null, error: 'missing_app_credentials' }),
    graphJson(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?` +
        `fields=id,name,category,instagram_business_account,connected_instagram_account&access_token=${t}`,
    ),
    graphJson(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/businesses?` +
        `fields=id,name,owned_pages{id,name},client_pages{id,name}&access_token=${t}`,
    ),
  ]);

  const granted: string[] = [];
  const declined: string[] = [];
  for (const p of (permissions as any)?.body?.data ?? []) {
    if (p?.status === 'granted') granted.push(p.permission);
    else if (p?.permission) declined.push(p.permission);
  }

  const accountsData = (accounts as any)?.body?.data;

  return {
    fb_user_id: (me as any)?.body?.id ?? null,
    fb_user_name: (me as any)?.body?.name ?? null,
    granted_scopes: granted,
    declined_scopes: declined,
    granular_scopes: (debugToken as any)?.body?.data?.granular_scopes ?? [],
    debug_token_raw: debugToken,
    me_accounts_raw: accounts,
    me_businesses_raw: businesses,
    pages_found_count: Array.isArray(accountsData) ? accountsData.length : 0,
  };
}

/** Attach the measurement to the record written at start (matched by state key). */
export async function recordOAuthCallback(
  supabase: any,
  params: { userId: string; provider: string; stateKey: string; measurement: CallbackMeasurement },
): Promise<void> {
  const payload = {
    fb_user_id: params.measurement.fb_user_id,
    fb_user_name: params.measurement.fb_user_name,
    granted_scopes: params.measurement.granted_scopes,
    declined_scopes: params.measurement.declined_scopes,
    granular_scopes: params.measurement.granular_scopes,
    debug_token_raw: params.measurement.debug_token_raw,
    me_accounts_raw: params.measurement.me_accounts_raw,
    me_businesses_raw: params.measurement.me_businesses_raw,
    pages_found_count: params.measurement.pages_found_count,
    callback_completed_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('meta_oauth_diagnostics')
      .update(payload)
      .eq('state_key', params.stateKey)
      .eq('user_id', params.userId)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      // The start half is missing (e.g. an older start function) — keep the
      // measurement anyway so the diff still has a row to compare.
      await supabase.from('meta_oauth_diagnostics').insert({
        user_id: params.userId,
        provider: params.provider,
        state_key: params.stateKey,
        ...payload,
      });
    }
  } catch (e) {
    console.warn('[meta-oauth-diagnostics] callback record failed:', e);
  }
}
