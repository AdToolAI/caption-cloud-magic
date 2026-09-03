/**
 * Classifies the real health of a social connection row.
 *
 * A row's mere existence is NOT proof of a usable connection: TikTok access
 * tokens live 24h, and Meta tokens issued before the `business_management`
 * approval lack the scopes the publishing path needs.
 *
 * Legacy rows without metadata are never reported as "disconnected" — they are
 * "verification required", so existing users are not scared off by a false
 * negative.
 */

export type ConnectionHealth = 'healthy' | 'expired' | 'attention' | 'unverified' | 'missing';

export interface ConnectionHealthResult {
  health: ConnectionHealth;
  /** i18n key for the badge/banner copy. */
  reasonKey: string;
  /** True when the user must run OAuth again to make posting work. */
  requiresReconnect: boolean;
  missingScopes?: string[];
}

export interface ConnectionHealthInput {
  provider: string;
  token_expires_at?: string | null;
  account_metadata?: Record<string, unknown> | null;
  account_id?: string | null;
}

/** Scopes the active publishing path relies on, per provider. */
export const REQUIRED_SCOPES: Record<string, string[]> = {
  facebook: ['pages_manage_posts', 'pages_show_list', 'business_management'],
  instagram: ['instagram_content_publish', 'instagram_basic', 'business_management'],
};

const EXPIRY_WARNING_MS = 24 * 60 * 60 * 1000;

export function classifyConnectionHealth(
  connection: ConnectionHealthInput | null | undefined,
  now: number = Date.now(),
): ConnectionHealthResult {
  if (!connection) {
    return { health: 'missing', reasonKey: 'connectionHealth.missing', requiresReconnect: false };
  }

  const provider = connection.provider;
  const meta = (connection.account_metadata ?? {}) as Record<string, unknown>;

  // 1. Hard expiry always wins — the token cannot be used any more.
  const expiresAt = connection.token_expires_at ? Date.parse(connection.token_expires_at) : NaN;
  if (Number.isFinite(expiresAt)) {
    if (expiresAt <= now) {
      return { health: 'expired', reasonKey: 'connectionHealth.expired', requiresReconnect: true };
    }
    if (expiresAt - now < EXPIRY_WARNING_MS) {
      return { health: 'attention', reasonKey: 'connectionHealth.expiringSoon', requiresReconnect: false };
    }
  }

  // 2. Meta: page selection still pending → posting cannot target a page.
  if ((provider === 'facebook' || provider === 'instagram') && meta.selection_required === true) {
    return { health: 'attention', reasonKey: 'connectionHealth.selectionRequired', requiresReconnect: false };
  }

  // 3. Instagram: publishing needs the stored page access token.
  if (provider === 'instagram' && !meta.page_access_token_encrypted) {
    return { health: 'attention', reasonKey: 'connectionHealth.igPageTokenMissing', requiresReconnect: true };
  }

  // 4. Meta scopes — only judge when the metadata actually records them.
  const required = REQUIRED_SCOPES[provider];
  if (required) {
    const granted = Array.isArray(meta.granted_scopes) ? (meta.granted_scopes as string[]) : null;
    if (!granted || granted.length === 0) {
      return { health: 'unverified', reasonKey: 'connectionHealth.unverified', requiresReconnect: false };
    }
    const missing = required.filter((scope) => !granted.includes(scope));
    if (missing.length > 0) {
      return {
        health: 'attention',
        reasonKey: 'connectionHealth.missingScopes',
        requiresReconnect: true,
        missingScopes: missing,
      };
    }
  }

  // 5. No expiry recorded at all (legacy row) → verification required, not broken.
  if (!Number.isFinite(expiresAt)) {
    return { health: 'unverified', reasonKey: 'connectionHealth.unverified', requiresReconnect: false };
  }

  return { health: 'healthy', reasonKey: 'connectionHealth.healthy', requiresReconnect: false };
}

/** A connection is only "usable for publishing" when nothing needs a reconnect. */
export function isPublishReady(result: ConnectionHealthResult): boolean {
  return result.health === 'healthy' || result.health === 'attention'
    ? !result.requiresReconnect
    : false;
}
