// Shared SSRF-safe fetch guard for edge functions that fetch user-supplied URLs.
// Blocks localhost / private / link-local / metadata IP ranges, resolves DNS to
// mitigate rebinding, follows redirects manually (re-validating every hop),
// caps response size, and enforces a request timeout.

export type SafeFetchErrorReason =
  | "invalid_url"
  | "blocked_host"
  | "timeout"
  | "too_many_redirects"
  | "http_error"
  | "invalid_content_type"
  | "too_large";

export class SafeFetchError extends Error {
  reason: SafeFetchErrorReason;
  status?: number;
  constructor(reason: SafeFetchErrorReason, message?: string, status?: number) {
    super(message ?? reason);
    this.reason = reason;
    this.status = status;
  }
}

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // ~2MB
const TIMEOUT_MS = 8000;

function ipToParts(ip: string): number[] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts;
}

function isBlockedIPv4(ip: string): boolean {
  const p = ipToParts(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // 169.254/16 incl metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === "::1") return true;
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true; // fc00::/7
  if (norm.startsWith("fe8") || norm.startsWith("fe9") || norm.startsWith("fea") || norm.startsWith("feb")) return true; // fe80::/10
  return false;
}

function isBlockedIP(ip: string): boolean {
  if (ip.includes(":")) return isBlockedIPv6(ip);
  return isBlockedIPv4(ip);
}

function isLikelyIP(host: string): boolean {
  return /^[\d.]+$/.test(host) || host.includes(":");
}

async function assertHostAllowed(hostname: string): Promise<void> {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "0.0.0.0") {
    throw new SafeFetchError("blocked_host", `Blocked hostname: ${h}`);
  }
  if (isLikelyIP(h)) {
    if (isBlockedIP(h)) throw new SafeFetchError("blocked_host", `Blocked IP literal: ${h}`);
    return;
  }
  // DNS resolution to mitigate rebinding
  try {
    const [a, aaaa] = await Promise.allSettled([
      Deno.resolveDns(h, "A"),
      Deno.resolveDns(h, "AAAA"),
    ]);
    const ips: string[] = [];
    if (a.status === "fulfilled") ips.push(...a.value);
    if (aaaa.status === "fulfilled") ips.push(...aaaa.value);
    if (ips.length === 0) {
      throw new SafeFetchError("blocked_host", `Could not resolve host: ${h}`);
    }
    for (const ip of ips) {
      if (isBlockedIP(ip)) {
        throw new SafeFetchError("blocked_host", `Resolved to blocked IP: ${ip}`);
      }
    }
  } catch (e) {
    if (e instanceof SafeFetchError) throw e;
    throw new SafeFetchError("blocked_host", `DNS resolution failed for ${h}`);
  }
}

function parseAndValidateUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError("invalid_url", `Malformed URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("invalid_url", `Unsupported scheme: ${url.protocol}`);
  }
  return url;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
}

/**
 * Safely fetches a user-supplied URL, guarding against SSRF (including DNS
 * rebinding) and unbounded redirects/response bodies. Throws SafeFetchError
 * on any failure — callers must surface a structured error, never silently
 * proceed with empty/partial data.
 */
export async function safeFetchText(rawUrl: string): Promise<SafeFetchResult> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = parseAndValidateUrl(currentUrl);
    await assertHostAllowed(url.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AdToolBrandDNA/1.0; +https://useadtool.ai)",
        },
      });
    } catch (e: any) {
      if (e?.name === "AbortError") throw new SafeFetchError("timeout", "Request timed out");
      throw new SafeFetchError("blocked_host", `Fetch failed: ${e?.message ?? e}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      res.body?.cancel().catch(() => {});
      if (!location) throw new SafeFetchError("http_error", "Redirect without Location header", res.status);
      if (hop === MAX_REDIRECTS) throw new SafeFetchError("too_many_redirects", "Too many redirects");
      currentUrl = new URL(location, url).toString();
      continue;
    }

    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      throw new SafeFetchError("http_error", `HTTP ${res.status}`, res.status);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType) && contentType !== "") {
      res.body?.cancel().catch(() => {});
      throw new SafeFetchError("invalid_content_type", `Unexpected content-type: ${contentType}`);
    }

    // Read body incrementally, capped at MAX_BODY_BYTES
    const reader = res.body?.getReader();
    if (!reader) {
      return { finalUrl: url.toString(), status: res.status, contentType, text: "" };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_BODY_BYTES) {
            await reader.cancel().catch(() => {});
            throw new SafeFetchError("too_large", "Response body too large");
          }
          chunks.push(value);
        }
      }
    } catch (e) {
      if (e instanceof SafeFetchError) throw e;
      throw new SafeFetchError("timeout", "Stream read failed");
    }
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.byteLength;
    }
    const text = new TextDecoder().decode(buf);
    return { finalUrl: url.toString(), status: res.status, contentType, text };
  }
  throw new SafeFetchError("too_many_redirects", "Too many redirects");
}
