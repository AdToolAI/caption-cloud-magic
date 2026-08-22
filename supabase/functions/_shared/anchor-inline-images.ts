/**
 * anchor-inline-images — V442.
 *
 * Why this exists
 * ---------------
 * `compose-scene-anchor` used to hand the image model plain `image_url` refs
 * that point at OUR Supabase Storage (cast portraits, identity headshots,
 * world refs). The model then has to crawl those URLs itself. On 2026-08-22
 * (scene S11) exactly that crawl step failed:
 *
 *   nano_banana_2  -> request timeout
 *   gemini3pro     -> HTTP 400 "Cannot fetch content from the provided URL.
 *                     The request to crawl the page timed out."
 *
 * Portraits were present and valid — only the provider-side fetch died. This
 * module removes the crawl dependency for internal storage objects: bytes are
 * read server-side (service role) and passed inline as a data URI.
 *
 * External / third-party references keep their URL form: we do not blindly
 * download arbitrary hosts (SSRF policy).
 *
 * Deliberately dependency-free so it is unit-testable from the Vitest suite.
 */

/** Hard ceiling for a single inlined reference image. */
export const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

export type InlineFailureReason =
  | "inline_fetch_failed"
  | "inline_bad_content_type"
  | "inline_too_large";

export interface InlineImagePart {
  /** Original URL — kept for logging/ordering diagnostics. */
  sourceUrl: string;
  /** What actually goes into `image_url.url`: a data URI or the original URL. */
  url: string;
  /** True when bytes were embedded (no provider crawl needed). */
  inlined: boolean;
}

export interface InlineImageFailure {
  sourceUrl: string;
  reason: InlineFailureReason;
  detail?: string;
}

export interface InlineImageResult {
  parts: InlineImagePart[];
  failures: InlineImageFailure[];
}

/**
 * True for URLs served by our own Supabase Storage.
 *
 * Accepts both the project URL host and any `*.supabase.co` storage path, so
 * signed and public object URLs both qualify.
 */
export function isInternalStorageUrl(
  url: unknown,
  supabaseUrl?: string | null,
): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (!parsed.pathname.startsWith("/storage/v1/object/")) return false;
  if (supabaseUrl) {
    try {
      if (new URL(supabaseUrl).host === parsed.host) return true;
    } catch { /* fall through to host suffix test */ }
  }
  return parsed.host.endsWith(".supabase.co") ||
    parsed.host.endsWith(".supabase.in");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Builds provider image parts for `urls`, preserving order 1:1.
 *
 * Internal storage objects are fetched and embedded as data URIs. Everything
 * else is passed through untouched. A failed internal fetch is reported in
 * `failures` AND passed through as a URL, so the caller can decide whether to
 * hard-fail with a structured reason or let the provider try the crawl.
 */
export async function buildInlineImageParts(
  urls: readonly string[],
  opts: {
    supabaseUrl?: string | null;
    fetchImpl?: typeof fetch;
    maxBytes?: number;
  } = {},
): Promise<InlineImageResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? MAX_INLINE_IMAGE_BYTES;
  const parts: InlineImagePart[] = [];
  const failures: InlineImageFailure[] = [];

  for (const sourceUrl of urls) {
    if (!isInternalStorageUrl(sourceUrl, opts.supabaseUrl)) {
      parts.push({ sourceUrl, url: sourceUrl, inlined: false });
      continue;
    }
    try {
      const resp = await doFetch(sourceUrl);
      if (!resp.ok) {
        failures.push({
          sourceUrl,
          reason: "inline_fetch_failed",
          detail: `http_${resp.status}`,
        });
        parts.push({ sourceUrl, url: sourceUrl, inlined: false });
        continue;
      }
      const contentType = (resp.headers.get("content-type") ?? "").split(";")[0]
        .trim().toLowerCase();
      if (!contentType.startsWith("image/")) {
        failures.push({
          sourceUrl,
          reason: "inline_bad_content_type",
          detail: contentType || "unknown",
        });
        parts.push({ sourceUrl, url: sourceUrl, inlined: false });
        continue;
      }
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.byteLength === 0) {
        failures.push({ sourceUrl, reason: "inline_fetch_failed", detail: "empty" });
        parts.push({ sourceUrl, url: sourceUrl, inlined: false });
        continue;
      }
      if (buf.byteLength > maxBytes) {
        failures.push({
          sourceUrl,
          reason: "inline_too_large",
          detail: `${buf.byteLength}`,
        });
        parts.push({ sourceUrl, url: sourceUrl, inlined: false });
        continue;
      }
      parts.push({
        sourceUrl,
        url: `data:${contentType};base64,${bytesToBase64(buf)}`,
        inlined: true,
      });
    } catch (e) {
      failures.push({
        sourceUrl,
        reason: "inline_fetch_failed",
        detail: e instanceof Error ? e.name : "error",
      });
      parts.push({ sourceUrl, url: sourceUrl, inlined: false });
    }
  }

  return { parts, failures };
}

/** Never leak signed URLs / tokens into user-visible copy or scene rows. */
export function sanitizeAnchorReason(reason: unknown): string {
  const raw = typeof reason === "string" ? reason : "unknown";
  const cleaned = raw
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[token]")
    .trim();
  return (cleaned.length > 0 ? cleaned : "unknown").slice(0, 120);
}
