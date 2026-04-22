// Shared Meta page discovery helper.
//
// Single source of truth for "which pages does this Meta user manage,
// and which of them actually have a verified linked Instagram Business account".
//
// Why this exists:
//   /me/accounts sometimes returns an `instagram_business_account` /
//   `connected_instagram_account` field inline, but in practice Meta is
//   inconsistent about that. Real, valid IG-linked pages frequently come back
//   with NEITHER field populated in the list response.
//
// We therefore do a two-step verification:
//   1. /me/accounts → list all pages (with the user access token)
//   2. for each page, hit /{page_id}?fields=instagram_business_account,
//      connected_instagram_account using THAT PAGE'S OWN access token.
//
// In addition, this module emits hard diagnostics so the UI can tell the
// user *why* discovery yielded zero IG-capable pages (Meta returned no
// pages at all? returned pages but verification failed? returned pages
// but no IG link?).

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
  /** Optional reason why IG verification failed for this page. */
  verify_error?: string | null;
}

export interface PageVerifyFailure {
  page_id: string;
  page_name: string;
  error: string;
}

export interface DiscoveryDiagnostics {
  /** How many pages /me/accounts returned. */
  pages_found_count: number;
  /** How many pages had an access_token we could use. */
  pages_with_token_count: number;
  /** How many pages came back with inline IG hint. */
  pages_with_inline_ig_count: number;
  /** How many pages were ultimately verified as IG-capable. */
  verified_instagram_count: number;
  /** Per-page IG verification failures (truncated for storage). */
  page_verify_failures: PageVerifyFailure[];
  /** Did /me/accounts itself fail? */
  list_error?: string | null;
  /** Mode used for discovery. */
  mode: 'verify_instagram' | 'list_only';
  /** Timestamp of the discovery run (UTC ISO). */
  ran_at: string;
}

export interface DiscoveryResult {
  pages: VerifiedPage[];
  diagnostics: DiscoveryDiagnostics;
}

/** Step 1: List all pages this Meta user manages. */
export async function listMetaPages(userAccessToken: string): Promise<{
  pages: RawPage[];
  error: string | null;
}> {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?` +
    `fields=id,name,category,picture{url},access_token,` +
    `instagram_business_account,connected_instagram_account&` +
    `access_token=${userAccessToken}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errBody = await res.text();
      console.error('[meta-page-discovery] /me/accounts failed:', errBody);
      return { pages: [], error: `me/accounts ${res.status}: ${errBody.slice(0, 500)}` };
    }
    const json = await res.json();
    const pages = (json?.data || []) as RawPage[];
    console.log(
      `[meta-page-discovery] /me/accounts returned ${pages.length} page(s):`,
      pages.map((p) => ({
        id: p.id,
        name: p.name,
        has_token: !!p.access_token,
        inline_ig: p.instagram_business_account?.id || p.connected_instagram_account?.id || null,
      }))
    );
    return { pages, error: null };
  } catch (e: any) {
    console.error('[meta-page-discovery] /me/accounts threw:', e);
    return { pages: [], error: `me/accounts threw: ${e?.message || String(e)}` };
  }
}

/**
 * Step 2: Verify a single page's IG link via the page node.
 * Returns either an IG user id (string) or a structured failure object.
 */
export async function verifyPageInstagramLink(
  pageId: string,
  pageAccessToken: string,
  inlineHint?: string | null
): Promise<{ ig_id: string | null; error: string | null }> {
  // Always run a real per-page check even if inline hint is present —
  // the hint is unreliable in practice and the per-page node is the ground
  // truth. We still accept the hint as a fast-path success when present.
  if (inlineHint) {
    return { ig_id: inlineHint, error: null };
  }

  if (!pageAccessToken) {
    return { ig_id: null, error: 'missing_page_access_token' };
  }

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
      return { ig_id: null, error: `page_node ${res.status}: ${errBody.slice(0, 300)}` };
    }
    const json = await res.json();
    const igId =
      json?.instagram_business_account?.id ||
      json?.connected_instagram_account?.id ||
      null;
    return { ig_id: igId, error: igId ? null : 'no_instagram_link_on_page' };
  } catch (e: any) {
    console.warn(
      `[meta-page-discovery] page node verify threw for ${pageId}:`,
      e
    );
    return { ig_id: null, error: `page_node threw: ${e?.message || String(e)}` };
  }
}

/**
 * Combined: list pages, optionally verify IG per page, return both the
 * normalized page list AND a structured diagnostics block.
 */
export async function discoverMetaPagesWithDiagnostics(
  userAccessToken: string,
  options: { verifyInstagram: boolean }
): Promise<DiscoveryResult> {
  const ran_at = new Date().toISOString();
  const { pages: rawPages, error: listError } = await listMetaPages(userAccessToken);

  const pages_found_count = rawPages.length;
  const pages_with_token_count = rawPages.filter((p) => !!p.access_token).length;
  const pages_with_inline_ig_count = rawPages.filter(
    (p) => !!(p.instagram_business_account?.id || p.connected_instagram_account?.id)
  ).length;

  if (!options.verifyInstagram) {
    const verified: VerifiedPage[] = rawPages.map((p) => {
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
    return {
      pages: verified,
      diagnostics: {
        pages_found_count,
        pages_with_token_count,
        pages_with_inline_ig_count,
        verified_instagram_count: verified.filter((p) => p.has_instagram).length,
        page_verify_failures: [],
        list_error: listError,
        mode: 'list_only',
        ran_at,
      },
    };
  }

  // Verify each page in parallel — Meta may not return IG inline.
  const failures: PageVerifyFailure[] = [];
  const verifiedSettled = await Promise.allSettled(
    rawPages.map(async (p) => {
      const inlineHint =
        p.instagram_business_account?.id ||
        p.connected_instagram_account?.id ||
        null;
      const { ig_id, error } = await verifyPageInstagramLink(
        p.id,
        p.access_token,
        inlineHint
      );
      if (!ig_id && error) {
        failures.push({ page_id: p.id, page_name: p.name, error });
      }
      return {
        id: p.id,
        name: p.name,
        category: p.category || 'Page',
        picture_url: p.picture?.data?.url || null,
        access_token: p.access_token,
        has_instagram: !!ig_id,
        instagram_business_account_id: ig_id,
        verify_error: error,
      } as VerifiedPage;
    })
  );

  const result: VerifiedPage[] = [];
  for (const entry of verifiedSettled) {
    if (entry.status === 'fulfilled') {
      result.push(entry.value);
    } else {
      console.warn('[meta-page-discovery] page verify settled-rejected:', entry.reason);
    }
  }

  const verified_instagram_count = result.filter((p) => p.has_instagram).length;

  console.log('[meta-page-discovery] diagnostics:', {
    pages_found_count,
    pages_with_token_count,
    pages_with_inline_ig_count,
    verified_instagram_count,
    failure_count: failures.length,
    list_error: listError,
  });

  return {
    pages: result,
    diagnostics: {
      pages_found_count,
      pages_with_token_count,
      pages_with_inline_ig_count,
      verified_instagram_count,
      page_verify_failures: failures.slice(0, 10),
      list_error: listError,
      mode: 'verify_instagram',
      ran_at,
    },
  };
}

/**
 * Backwards-compatible wrapper for callers that don't need diagnostics.
 */
export async function discoverMetaPages(
  userAccessToken: string,
  options: { verifyInstagram: boolean }
): Promise<VerifiedPage[]> {
  const { pages } = await discoverMetaPagesWithDiagnostics(userAccessToken, options);
  return pages;
}

/**
 * Classify a discovery result into a precise UI-facing status string.
 *
 * Statuses:
 *   no_pages_access                   missing scopes AND no pages
 *   meta_pages_hidden_or_unavailable  scopes ok, but /me/accounts returned 0 pages
 *   no_pages_found                    /me/accounts returned 0, generic
 *   pages_found_but_verification_failed  pages exist but every per-page verify failed
 *   pages_found_but_no_instagram_link    pages exist, verifications ran, no IG link
 *   single_instagram_page             exactly one IG-capable page
 *   multiple_instagram_pages          2+ IG-capable pages
 *   single_page / multiple_pages      Facebook-only flow
 */
export function classifyDiscoveryResult(
  pages: VerifiedPage[],
  provider: 'facebook' | 'instagram',
  missingScopes: string[],
  diagnostics?: DiscoveryDiagnostics
): string {
  if (missingScopes.length > 0 && pages.length === 0) return 'no_pages_access';

  if (pages.length === 0) {
    // Scopes look ok but Meta still returned nothing → most likely a
    // business-managed page that wasn't surfaced to the app.
    if (missingScopes.length === 0) return 'meta_pages_hidden_or_unavailable';
    return 'no_pages_found';
  }

  if (provider === 'instagram') {
    const igCount = pages.filter((p) => p.has_instagram).length;
    if (igCount === 0) {
      // Distinguish "we couldn't verify ANY page" vs "we verified them and none had IG".
      const allFailed =
        diagnostics &&
        diagnostics.mode === 'verify_instagram' &&
        diagnostics.page_verify_failures.length >= pages.length &&
        diagnostics.page_verify_failures.every(
          (f) => f.error !== 'no_instagram_link_on_page'
        );
      if (allFailed) return 'pages_found_but_verification_failed';
      return 'pages_found_but_no_instagram_link';
    }
    if (igCount === 1) return 'single_instagram_page';
    return 'multiple_instagram_pages';
  }

  return pages.length === 1 ? 'single_page' : 'multiple_pages';
}

/** Read granted/declined permissions for the current Meta user token. */
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
