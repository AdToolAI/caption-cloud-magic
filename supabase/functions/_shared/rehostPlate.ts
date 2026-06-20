// v143 — Plate Rehost Helper
//
// Sync.so refuses inputs whose URL it cannot fetch ("generation_input_video_inaccessible",
// HTTP 422). Hailuo/Replicate presigned S3 URLs expire after ~60 minutes —
// which is shorter than the end-to-end time for many multi-pass dialog scenes.
// To make plate URLs stable for the full Sync.so dispatch window we rehost
// every plate (preclip or full plate) into our own `lipsync-plates` bucket
// (public-read) before sending the URL to Sync.so.
//
// Idempotent: deterministic path derived from sourceUrl hash + sceneId/passIdx.
// If the object already exists we return its public URL without re-downloading.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BUCKET = "lipsync-plates";

function safeSlug(s: string | null | undefined, fallback = "x"): string {
  if (!s) return fallback;
  return String(s).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64) || fallback;
}

async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface RehostOpts {
  /** Identifying tag like scene id, used only for path readability. */
  sceneId?: string | null;
  /** Pass index for path readability. */
  passIdx?: number | null;
  /** Kind of plate, e.g. "preclip" or "fullplate". */
  kind?: string | null;
  /** Optional logical owner (user id) for path readability. */
  ownerId?: string | null;
}

export interface RehostResult {
  url: string;
  bucket: string;
  path: string;
  /** true if the object was freshly uploaded in this call. */
  uploaded: boolean;
  /** Source URL we rehosted from. */
  sourceUrl: string;
  /** Size in bytes (best-effort; 0 if unavailable). */
  bytes: number;
  /** Total ms spent in rehost (download + upload). */
  durationMs: number;
}

/**
 * Download `sourceUrl` and re-upload it into our own storage. Returns a
 * public URL that Sync.so can fetch at any time (no presign expiry).
 *
 * Safe to call repeatedly: the destination path is deterministic per
 * sourceUrl, so subsequent calls become idempotent no-ops returning the
 * same public URL.
 */
export async function rehostPlate(
  supabase: SupabaseClient,
  sourceUrl: string,
  opts: RehostOpts = {},
): Promise<RehostResult> {
  const startedAt = Date.now();
  if (!sourceUrl || typeof sourceUrl !== "string") {
    throw new Error("rehostPlate: sourceUrl is required");
  }

  // If the URL is already a fresh signed URL inside our bucket, return as-is.
  // We only short-circuit `/sign/` URLs because plates must be Sync.so-fetchable
  // (public URLs aren't issued from this bucket).
  if (/\/storage\/v1\/object\/sign\/lipsync-plates\//.test(sourceUrl)) {
    return {
      url: sourceUrl,
      bucket: BUCKET,
      path: sourceUrl.split(`/${BUCKET}/`)[1]?.split("?")[0] ?? "",
      uploaded: false,
      sourceUrl,
      bytes: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const owner = safeSlug(opts.ownerId, "shared");
  const scene = safeSlug(opts.sceneId, "scene");
  const pass = typeof opts.passIdx === "number" ? `p${opts.passIdx + 1}` : "px";
  const kind = safeSlug(opts.kind, "plate");

  // Deterministic hash from the source URL minus its query string. Sync.so
  // returns the same expired-S3 URL across retries so this collapses retries
  // into a single rehosted object.
  const cleanedSource = sourceUrl.split("?")[0];
  const hash = (await sha1Hex(cleanedSource)).slice(0, 16);
  const path = `${owner}/${scene}/${pass}-${kind}-${hash}.mp4`;

  // If object already exists in bucket, just return public URL (idempotent).
  const { data: existing } = await supabase
    .storage
    .from(BUCKET)
    .list(`${owner}/${scene}`, { limit: 1000, search: `${pass}-${kind}-${hash}` })
    .catch(() => ({ data: null as any }));
  const alreadyPresent = Array.isArray(existing) &&
    existing.some((e: any) => e?.name && path.endsWith(e.name));
  if (alreadyPresent) {
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return {
      url: pub.publicUrl,
      bucket: BUCKET,
      path,
      uploaded: false,
      sourceUrl,
      bytes: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // Download with a generous timeout — these are 1–30 MB mp4s.
  const dlRes = await fetch(sourceUrl, {
    method: "GET",
    signal: AbortSignal.timeout(45_000),
  });
  if (!dlRes.ok) {
    throw new Error(
      `rehostPlate: source fetch failed HTTP ${dlRes.status} for ${sourceUrl.slice(0, 200)}`,
    );
  }
  const buf = new Uint8Array(await dlRes.arrayBuffer());
  if (buf.byteLength < 1024) {
    throw new Error(
      `rehostPlate: source too small (${buf.byteLength} bytes) — likely an error page`,
    );
  }

  const up = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: "video/mp4",
    cacheControl: "604800", // 7d edge cache; Sync.so fetches once
    upsert: true,
  });
  if (up.error) {
    throw new Error(`rehostPlate: upload failed: ${up.error.message}`);
  }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return {
    url: pub.publicUrl,
    bucket: BUCKET,
    path,
    uploaded: true,
    sourceUrl,
    bytes: buf.byteLength,
    durationMs: Date.now() - startedAt,
  };
}
