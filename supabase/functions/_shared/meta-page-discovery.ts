// Shared Meta page discovery helper.
//
// The single source of truth for "which pages does this Meta user manage,
// and which of them actually have a verified linked Instagram Business account".
//
// Why this exists:
//   /me/accounts sometimes returns an `instagram_business_account` /
//   `connected_instagram_account` field inline, but in practice Meta is
//   inconsistent about that. Real, valid IG-linked pages frequently come back
//   with NEITHER field populated in the list response.
//
// To detect IG correctly we therefore do a two-step verification:
//   1. /me/accounts → list all pages (with the user access token)
//   2. for each page, hit /{page_id}?fields=instagram_business_account,
//      connected_instagram_account using THAT PAGE'S OWN access token.
//
// Step 2 is what reliably surfaces the IG link Meta knows about.

const GRAPH_VERSION = 'v24.0';

export interface RawPage {
  id: string;
  name: string;
  category?: string;
  picture?: { data?: { url?: string } };
  access_token: string;
  // Inline IG fields (sometimes present, sometimes not — never trust alone)
  instagram_business_account?: { id?: string };
  connected_instagram_account?: { id?: string };
}

export interface VerifiedPage {
  id: string;
  name: string;
  category: string;
  picture_url: string | null;
  access_token: string;
  has_instagram: boolean;
  instagram_business_account_id: string | null;
}

/**
 * Step 1: List all pages this Meta user manages.
 * Returns the raw /me/accounts payload (already including inline IG fields
 * in case Meta DID provide them — we still verify per page in step 2).
 */
export async function listMetaPages(userAccessToken: string): Promise<RawPage[]> {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?` +
    `fields=id,name,category,picture{url},access_token,` +
    `instagram_business_account,connected_instagram_account&` +
    `access_token=${userAccessToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errBody = await res.text();
    console.error('[meta-page-discovery] /me/accounts failed:', errBody);
    throw new Error(`/me/accounts failed: ${errBody}`);
  }
  const json = await res.json();
  return (json?.data || []) as RawPage[];
}

/**
 * Step 2: For a single page, verify whether it has a linked Instagram
 * Business account using THAT PAGE's own access token.
 *
 * Returns the IG user id when found, otherwise null. Never throws — failures
 * are treated as "no link" so one bad page can't break the whole flow.
 */
export async function verifyPageInstagramLink(
  pageId: string,
  pageAccessToken: string,
  inlineHint?: string | null
): Promise<string | null> {
  // If Meta already gave us a link inline, accept it (still cheap).
  if (inlineHint) return inlineHint;

  try {
    const url =
      `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}?` +
      `fields=instagram_business_account,connected_instagram_account&` +
      `access_token=${pageAccessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.text();
      console.warn(
        `[meta-page-discovery] page node verify failed for ${pageId}:`,
        errBody
      );
      return null;
    }
    const json = await res.json();
    return (
      json?.instagram_business_account?.id ||
      json?.connected_instagram_account?.id ||
      null
    );
  } catch (e) {
    console.warn(
      `[meta-page-discovery] page node verify threw for ${pageId}:`,
      e
    );
    return null;
  }
}

/**
 * Combined: list pages and, for each page, run the per-page IG verification
 * in parallel. Returns one normalized record per page.
 *
 * `verifyInstagram=false` skips the per-page verification entirely (used by
 * the pure Facebook flow where IG status doesn't matter).
 */
export async function discoverMetaPages(
  userAccessToken: string,
  options: { verifyInstagram: boolean }
): Promise<VerifiedPage[]> {
  const pages = await listMetaPages(userAccessToken);

  if (!options.verifyInstagram) {
    return pages.map((p) => {
      const inline =
        p.instagram_business_account?.id ||
        p.connected_instagram_account?.id ||
        null;
      return {
        id: p.id,
        name: p.name,
        category: p.category || 'Page',
        picture_url: p.picture?.data?.url || null,
        access_token: p.access_token,
        has_instagram: !!inline,
        instagram_business_account_id: inline,
      };
    });
  }

  // Verify each page in parallel — Meta may not return IG inline.
  const verified = await Promise.allSettled(
    pages.map(async (p) => {
      const inlineHint =
        p.instagram_business_account?.id ||
        p.connected_instagram_account?.id ||
        null;
      const igId = await verifyPageInstagramLink(p.id, p.access_token, inlineHint);
      return {
        id: p.id,
        name: p.name,
        category: p.category || 'Page',
        picture_url: p.picture?.data?.url || null,
        access_token: p.access_token,
        has_instagram: !!igId,
        instagram_business_account_id: igId,
      } as VerifiedPage;
    })
  );

  const result: VerifiedPage[] = [];
  for (const entry of verified) {
    if (entry.status === 'fulfilled') {
      result.push(entry.value);
    }
  }
  return result;
}

/**
 * Classify a verified page list into a UI-facing status string.
 */
export function classifyDiscoveryResult(
  pages: VerifiedPage[],
  provider: 'facebook' | 'instagram',
  missingScopes: string[]
): string {
  if (missingScopes.length > 0 && pages.length === 0) return 'no_pages_access';
  if (pages.length === 0) return 'no_pages_found';

  if (provider === 'instagram') {
    const igCount = pages.filter((p) => p.has_instagram).length;
    if (igCount === 0) return 'pages_found_but_no_instagram_link';
    if (igCount === 1) return 'single_instagram_page';
    return 'multiple_instagram_pages';
  }

  return pages.length === 1 ? 'single_page' : 'multiple_pages';
}

/**
 * Read the granted/declined permissions for the current Meta user token.
 * Used to surface "you didn't actually grant pages_show_list" up to the UI.
 */
export async function fetchMetaGrantedScopes(
  userAccessToken: string
): Promise<{ granted: string[]; declined: string[] }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?access_token=${userAccessToken}`
    );
    if (!res.ok) return { granted: [], declined: [] };
    const json = await res.json();
    const granted: string[] = [];
    const declined: string[] = [];
    for (const p of json?.data ?? []) {
      if (p.status === 'granted') granted.push(p.permission);
      else declined.push(p.permission);
    }
    return { granted, declined };
  } catch (e) {
    console.warn('[meta-page-discovery] fetchMetaGrantedScopes failed:', e);
    return { granted: [], declined: [] };
  }
}

export function requiredPageScopesFor(provider: 'facebook' | 'instagram'): string[] {
  return provider === 'instagram'
    ? ['pages_show_list', 'instagram_basic']
    : ['pages_show_list', 'pages_read_engagement'];
}
