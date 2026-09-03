/**
 * Pure parser for TikTok OAuth v2 token responses.
 *
 * TikTok's `/v2/oauth/token/` endpoint returns the token fields FLAT in the
 * response body. Some older/other TikTok endpoints (and the historic code in
 * this repo) assumed a nested `{ data: { ... } }` envelope. This parser accepts
 * both shapes and returns an explicit structured result instead of throwing,
 * so callers can log a reason code without ever touching token values.
 *
 * No Deno/runtime dependencies — safe to unit test from Node/vitest.
 */

export interface TikTokTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  open_id: string;
  scope: string;
}

export type TikTokTokenParseResult =
  | { ok: true; tokens: TikTokTokens; shape: 'flat' | 'nested' }
  | { ok: false; code: TikTokTokenErrorCode; message: string };

export type TikTokTokenErrorCode =
  | 'EMPTY_RESPONSE'
  | 'PROVIDER_ERROR'
  | 'MISSING_ACCESS_TOKEN'
  | 'MISSING_REFRESH_TOKEN';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** TikTok signals success either by omitting `error` or by `error: "ok"`. */
function extractProviderError(raw: Record<string, unknown>): string | null {
  const err = raw.error;
  if (err === undefined || err === null) return null;
  if (typeof err === 'string') {
    if (err === '' || err.toLowerCase() === 'ok') return null;
    const desc = typeof raw.error_description === 'string' ? raw.error_description : '';
    return desc ? `${err}: ${desc}` : err;
  }
  if (isRecord(err)) {
    const code = typeof err.code === 'string' ? err.code : '';
    if (code === '' || code.toLowerCase() === 'ok') return null;
    const message = typeof err.message === 'string' ? err.message : '';
    return message ? `${code}: ${message}` : code;
  }
  return 'unknown_provider_error';
}

export function parseTikTokTokenResponse(raw: unknown): TikTokTokenParseResult {
  if (!isRecord(raw)) {
    return { ok: false, code: 'EMPTY_RESPONSE', message: 'TikTok returned no parsable token payload' };
  }

  const providerError = extractProviderError(raw);
  if (providerError) {
    return { ok: false, code: 'PROVIDER_ERROR', message: providerError };
  }

  // Prefer the flat shape (current v2 contract); fall back to the nested one.
  const flatHasToken = typeof raw.access_token === 'string' && raw.access_token.length > 0;
  const nested = isRecord(raw.data) ? raw.data : null;
  const source = flatHasToken ? raw : (nested ?? raw);
  const shape: 'flat' | 'nested' = flatHasToken || !nested ? 'flat' : 'nested';

  const accessToken = typeof source.access_token === 'string' ? source.access_token : '';
  if (!accessToken) {
    return { ok: false, code: 'MISSING_ACCESS_TOKEN', message: 'TikTok response contained no access_token' };
  }

  const refreshToken = typeof source.refresh_token === 'string' ? source.refresh_token : '';
  if (!refreshToken) {
    return { ok: false, code: 'MISSING_REFRESH_TOKEN', message: 'TikTok response contained no refresh_token' };
  }

  const expiresIn = typeof source.expires_in === 'number' && source.expires_in > 0
    ? source.expires_in
    : 86400; // TikTok access tokens live 24h

  return {
    ok: true,
    shape,
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      refresh_expires_in:
        typeof source.refresh_expires_in === 'number' ? source.refresh_expires_in : undefined,
      open_id: typeof source.open_id === 'string' ? source.open_id : '',
      scope: typeof source.scope === 'string' ? source.scope : '',
    },
  };
}
