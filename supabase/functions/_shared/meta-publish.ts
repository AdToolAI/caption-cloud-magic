// Shared Meta (Facebook Pages + Instagram Business) publishing helper.
// Used by publish-post (central dispatcher) and any other function that needs
// to post on behalf of a connected user.
//
// Responsibilities:
//   - Load per-user Meta connection from social_connections
//   - Decrypt the stored Page/User access token via _shared/crypto.ts
//   - Provide graphPost / graphGet against Graph API v24
//   - Container status polling for IG Reels + FB Videos
//   - Token health check + opportunistic refresh via fb_exchange_token
//   - Friendly error mapping (Meta error codes -> user-facing messages)

import { decryptToken, encryptToken } from './crypto.ts';

export const GRAPH_VERSION = 'v24.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaProvider = 'facebook' | 'instagram';

export interface MetaConnection {
  user_id: string;
  provider: MetaProvider;
  account_id: string;          // FB Page ID for facebook, IG Business Account ID for instagram
  account_name: string;
  access_token: string;        // DECRYPTED Page Access Token
  account_metadata: any;
  token_expires_at: string | null;
  scope: string | null;
}

export class MetaPublishError extends Error {
  code: string;
  reconnectRequired: boolean;
  fbCode?: number;
  fbSubcode?: number;
  fbTraceId?: string;

  constructor(opts: {
    code: string;
    message: string;
    reconnectRequired?: boolean;
    fbCode?: number;
    fbSubcode?: number;
    fbTraceId?: string;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.reconnectRequired = !!opts.reconnectRequired;
    this.fbCode = opts.fbCode;
    this.fbSubcode = opts.fbSubcode;
    this.fbTraceId = opts.fbTraceId;
  }
}

/**
 * Load + decrypt a per-user Meta connection. Falls back to legacy base64-
 * encoded tokens if decryption fails (older rows pre-encryption).
 */
export async function getMetaConnection(
  supabase: any,
  userId: string,
  provider: MetaProvider
): Promise<MetaConnection> {
  const { data: row, error } = await supabase
    .from('social_connections')
    .select('user_id, provider, account_id, account_name, access_token_hash, account_metadata, token_expires_at, scope')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) {
    throw new MetaPublishError({
      code: 'CONNECTION_LOOKUP_FAILED',
      message: `Could not load ${provider} connection: ${error.message}`,
    });
  }
  if (!row) {
    throw new MetaPublishError({
      code: 'NOT_CONNECTED',
      message: `Kein ${provider === 'facebook' ? 'Facebook' : 'Instagram'}-Account verbunden. Bitte unter Integrationen verbinden.`,
      reconnectRequired: true,
    });
  }
  if (!row.access_token_hash) {
    throw new MetaPublishError({
      code: 'NO_TOKEN',
      message: `Verbindung ohne Token gefunden. Bitte ${provider === 'facebook' ? 'Facebook' : 'Instagram'} neu verbinden.`,
      reconnectRequired: true,
    });
  }

  let plain: string;
  try {
    plain = await decryptToken(row.access_token_hash);
  } catch (e) {
    // Legacy fallback: some very old rows might be plain base64
    try {
      plain = atob(row.access_token_hash);
    } catch {
      throw new MetaPublishError({
        code: 'TOKEN_DECRYPT_FAILED',
        message: 'Token konnte nicht entschlüsselt werden. Bitte Verbindung erneuern.',
        reconnectRequired: true,
      });
    }
  }

  return {
    user_id: row.user_id,
    provider: row.provider,
    account_id: row.account_id,
    account_name: row.account_name,
    access_token: plain,
    account_metadata: row.account_metadata || {},
    token_expires_at: row.token_expires_at,
    scope: row.scope,
  };
}

/**
 * Opportunistic refresh: if token is expiring within `withinDays`, try
 * fb_exchange_token. Updates social_connections in-place on success.
 * Best-effort — failures are logged, not thrown (caller will hit a real
 * publish error if the token is actually dead).
 */
export async function ensureFreshToken(
  supabase: any,
  conn: MetaConnection,
  withinDays = 7
): Promise<MetaConnection> {
  if (!conn.token_expires_at) return conn;
  const expiresMs = new Date(conn.token_expires_at).getTime();
  const dueMs = Date.now() + withinDays * 86_400_000;
  if (expiresMs > dueMs) return conn;

  const APP_ID = Deno.env.get('META_APP_ID');
  const APP_SECRET = Deno.env.get('META_APP_SECRET');
  if (!APP_ID || !APP_SECRET) return conn;

  try {
    const url = `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(conn.access_token)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data?.access_token) {
      console.warn('[meta-publish] ensureFreshToken: exchange failed', data?.error?.message);
      return conn;
    }
    const newToken = data.access_token as string;
    const expiresIn = Number(data.expires_in) || 60 * 24 * 3600;
    const newExpires = new Date(Date.now() + expiresIn * 1000).toISOString();
    const encrypted = await encryptToken(newToken);
    await supabase
      .from('social_connections')
      .update({
        access_token_hash: encrypted,
        token_expires_at: newExpires,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', conn.user_id)
      .eq('provider', conn.provider);
    console.log(`[meta-publish] Refreshed ${conn.provider} token for user ${conn.user_id} (was due ${conn.token_expires_at})`);
    return { ...conn, access_token: newToken, token_expires_at: newExpires };
  } catch (e: any) {
    console.warn('[meta-publish] ensureFreshToken unexpected:', e?.message);
    return conn;
  }
}

// ---------- Graph API ----------

async function parseAndThrow(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw mapMetaError(data?.error || { message: `HTTP ${res.status}` });
  }
  return data;
}

export async function graphPost(path: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params);
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return parseAndThrow(res);
}

export async function graphGet(path: string, accessToken: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH_BASE}${path}${sep}access_token=${encodeURIComponent(accessToken)}`);
  return parseAndThrow(res);
}

/**
 * Poll a Meta container (IG media or FB video) until FINISHED.
 * Throws MetaPublishError on ERROR/EXPIRED/timeout.
 */
export async function waitForContainer(
  creationId: string,
  accessToken: string,
  opts: { maxMs?: number; intervalMs?: number; isFbVideo?: boolean } = {}
): Promise<void> {
  const maxMs = opts.maxMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const started = Date.now();

  while (Date.now() - started < maxMs) {
    const data = await graphGet(
      `/${creationId}?fields=status_code,status`,
      accessToken
    );
    const code = data.status_code || data.status;
    if (code === 'FINISHED' || code === 'PUBLISHED' || code === 'ready') return;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new MetaPublishError({
        code: 'MEDIA_PROCESSING_FAILED',
        message: `Meta konnte das Medium nicht verarbeiten (status=${code}).`,
      });
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new MetaPublishError({
    code: 'MEDIA_PROCESSING_TIMEOUT',
    message: `Meta brauchte länger als ${Math.round(maxMs / 1000)}s zum Verarbeiten. Bitte später erneut versuchen.`,
  });
}

// ---------- Error mapping ----------

export function mapMetaError(err: any): MetaPublishError {
  const code = Number(err?.code ?? 0);
  const sub = Number(err?.error_subcode ?? 0);
  const msg: string = err?.error_user_msg || err?.message || 'Unbekannter Meta-API-Fehler';
  const trace = err?.fbtrace_id;

  // 190 + various subs = token issues
  if (code === 190 || code === 102 || code === 463 || code === 467) {
    return new MetaPublishError({
      code: 'TOKEN_EXPIRED',
      message: 'Dein Access-Token ist abgelaufen oder wurde widerrufen. Bitte die Verbindung unter Integrationen neu autorisieren.',
      reconnectRequired: true,
      fbCode: code, fbSubcode: sub, fbTraceId: trace,
    });
  }
  // 200/210/299 = permissions
  if (code === 200 || code === 210 || code === 299 || code === 803) {
    return new MetaPublishError({
      code: 'PERMISSION_DENIED',
      message: `Berechtigung fehlt: ${msg}. Bitte Verbindung mit allen Scopes erneut autorisieren.`,
      reconnectRequired: true,
      fbCode: code, fbSubcode: sub, fbTraceId: trace,
    });
  }
  // 4/17/32/613 = rate limits
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 368) {
    return new MetaPublishError({
      code: 'RATE_LIMITED',
      message: 'Meta-Rate-Limit erreicht. Bitte einige Minuten warten und erneut versuchen.',
      fbCode: code, fbSubcode: sub, fbTraceId: trace,
    });
  }
  // 100 = invalid parameter — usually media URL not reachable
  if (code === 100) {
    return new MetaPublishError({
      code: 'INVALID_PARAMETER',
      message: `Ungültige Parameter (${msg}). Häufige Ursache: Medien-URL ist nicht öffentlich erreichbar.`,
      fbCode: code, fbSubcode: sub, fbTraceId: trace,
    });
  }
  return new MetaPublishError({
    code: 'META_API_ERROR',
    message: msg,
    fbCode: code, fbSubcode: sub, fbTraceId: trace,
  });
}

// ---------- Publishing primitives ----------

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|$)/i;
export function looksLikeVideo(url: string | null | undefined): boolean {
  return !!url && VIDEO_EXT.test(url);
}

/**
 * Build caption with optional hashtag tail.
 */
export function buildCaption(caption: string, hashtags?: string[] | null): string {
  if (!hashtags || hashtags.length === 0) return caption || '';
  const tags = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  return `${caption || ''}\n\n${tags}`.trim();
}

// --- Instagram ---

export interface InstagramPublishInput {
  igUserId: string;          // IG Business Account ID
  accessToken: string;       // Page Access Token (NOT user token)
  caption: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  mediaUrls?: string[];      // for carousel
  isStory?: boolean;
}

export async function publishInstagram(input: InstagramPublishInput): Promise<{ id: string }> {
  const { igUserId, accessToken, caption } = input;

  // Carousel
  if (input.mediaUrls && input.mediaUrls.length > 1) {
    const childIds: string[] = [];
    for (const url of input.mediaUrls.slice(0, 10)) {
      const isVid = looksLikeVideo(url);
      const child = await graphPost(`/${igUserId}/media`, {
        access_token: accessToken,
        is_carousel_item: 'true',
        ...(isVid
          ? { media_type: 'VIDEO', video_url: url }
          : { image_url: url }),
      });
      if (isVid) await waitForContainer(child.id, accessToken);
      childIds.push(child.id);
    }
    const container = await graphPost(`/${igUserId}/media`, {
      access_token: accessToken,
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
    });
    await waitForContainer(container.id, accessToken);
    const pub = await graphPost(`/${igUserId}/media_publish`, {
      creation_id: container.id,
      access_token: accessToken,
    });
    return { id: pub.id };
  }

  // Story
  if (input.isStory) {
    const isVid = looksLikeVideo(input.videoUrl || input.imageUrl || '');
    const container = await graphPost(`/${igUserId}/media`, {
      access_token: accessToken,
      media_type: 'STORIES',
      ...(isVid
        ? { video_url: (input.videoUrl || input.imageUrl)! }
        : { image_url: (input.imageUrl || input.videoUrl)! }),
    });
    await waitForContainer(container.id, accessToken);
    const pub = await graphPost(`/${igUserId}/media_publish`, {
      creation_id: container.id,
      access_token: accessToken,
    });
    return { id: pub.id };
  }

  // Reel (Video)
  const videoUrl = input.videoUrl || (looksLikeVideo(input.imageUrl) ? input.imageUrl! : null);
  if (videoUrl) {
    const container = await graphPost(`/${igUserId}/media`, {
      access_token: accessToken,
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: 'true',
    });
    await waitForContainer(container.id, accessToken, { maxMs: 300_000 });
    const pub = await graphPost(`/${igUserId}/media_publish`, {
      creation_id: container.id,
      access_token: accessToken,
    });
    return { id: pub.id };
  }

  // Single image
  if (!input.imageUrl) {
    throw new MetaPublishError({
      code: 'NO_MEDIA',
      message: 'Instagram-Posts benötigen ein Bild oder Video.',
    });
  }
  const container = await graphPost(`/${igUserId}/media`, {
    access_token: accessToken,
    image_url: input.imageUrl,
    caption,
  });
  await waitForContainer(container.id, accessToken);
  const pub = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: accessToken,
  });
  return { id: pub.id };
}

// --- Facebook Page ---

export interface FacebookPublishInput {
  pageId: string;
  accessToken: string;       // Page Access Token
  message: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  linkUrl?: string | null;
}

export async function publishFacebook(input: FacebookPublishInput): Promise<{ id: string }> {
  const { pageId, accessToken, message } = input;

  const videoUrl = input.videoUrl || (looksLikeVideo(input.imageUrl) ? input.imageUrl! : null);

  if (videoUrl) {
    const created = await graphPost(`/${pageId}/videos`, {
      access_token: accessToken,
      file_url: videoUrl,
      description: message,
    });
    // FB returns video id; status polling is optional but recommended
    if (created.id) {
      try { await waitForContainer(created.id, accessToken, { maxMs: 180_000, isFbVideo: true }); }
      catch (e) { /* video may still be processing async; FB usually publishes anyway */ }
    }
    return { id: created.id || created.post_id || created.video_id };
  }

  if (input.imageUrl) {
    const photo = await graphPost(`/${pageId}/photos`, {
      access_token: accessToken,
      url: input.imageUrl,
      caption: message,
    });
    return { id: photo.post_id || photo.id };
  }

  // Text / link
  const params: Record<string, string> = {
    access_token: accessToken,
    message,
  };
  if (input.linkUrl) params.link = input.linkUrl;
  const feed = await graphPost(`/${pageId}/feed`, params);
  return { id: feed.id };
}
