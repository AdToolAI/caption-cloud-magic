/**
 * image-encoding-cache.ts
 *
 * Invocation-local cache for image downloads + Base64 encoding used by
 * Rekognition payloads. Guarantees that the same URL is loaded and encoded
 * at most once within a single request scope.
 *
 * Why this matters
 * ----------------
 * The Edge runtime has a tight CPU budget. The previous implementation
 * loaded the anchor image once but then Base64-encoded it again for every
 * CompareFaces call (once per character). For N=4 speakers the anchor was
 * encoded 4+ times inside the same v274 pass, which pushed the worker over
 * the CPU limit before the HappyHorse dispatch could run.
 *
 * Contract
 * --------
 * - Same URL → same bytes → same Base64 string, cached for the lifetime of
 *   the cache instance (one `compose-video-clips` invocation).
 * - Errors are NOT cached: a failed fetch can be retried by the caller.
 * - The cache does not persist across requests, runs or generations.
 */

const FETCH_TIMEOUT_MS = 12_000;

export interface CachedImage {
  url: string;
  bytes: Uint8Array;
  base64: string;
}

export interface ImageCacheStats {
  loads: number;
  encodes: number;
}

/** Byte-identical, blockwise Base64 encoder (replaces per-byte concat). */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000; // 32768 — keeps String.fromCharCode stacks safe.
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin);
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const r = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export class ImageEncodingCache {
  private cache = new Map<string, CachedImage>();
  private stats: ImageCacheStats = { loads: 0, encodes: 0 };

  /** Load + encode once per URL. Returns null when the fetch fails. */
  async load(url: string): Promise<CachedImage | null> {
    const existing = this.cache.get(url);
    if (existing) return existing;

    const bytes = await fetchImageBytes(url);
    if (!bytes) return null;

    this.stats.loads++;
    const base64 = bytesToBase64(bytes);
    this.stats.encodes++;

    const entry: CachedImage = { url, bytes, base64 };
    this.cache.set(url, entry);
    return entry;
  }

  /** Direct access to an already cached entry (undefined if not loaded). */
  get(url: string): CachedImage | undefined {
    return this.cache.get(url);
  }

  getStats(): ImageCacheStats {
    return { ...this.stats };
  }
}
