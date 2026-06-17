/**
 * face-frame-extract (v129.13)
 *
 * Extracts a single JPEG frame from an MP4 at a given timestamp using
 * ffmpeg.wasm executed inside the Supabase Edge Function — no external
 * Replicate call. Uploads the JPEG to the existing `composer-frames`
 * storage bucket and returns a public URL.
 *
 * History:
 *   v129.10  introduced Gemini face-gate, broke because google/gemini-*
 *            via OpenRouter does not accept video/mp4 image_url blocks
 *   v129.11  switched to Replicate `lucataco/ffmpeg-extract-frame`
 *   v129.12  fixed env var name (REPLICATE_API_KEY)
 *   v129.13  Replicate model now returns 404 — replace with self-hosted
 *            ffmpeg.wasm. Same return shape & cache path, no API key
 *            needed, no external call.
 *
 * Cache strategy: deterministic storage path based on sha1(videoUrl + ":" +
 * frame). On a cache hit we HEAD the public URL and skip ffmpeg entirely.
 *
 * NEVER throws — returns `{ ok: false, reason }` so callers can degrade
 * gracefully (probe_unavailable, dispatch proceeds unchecked).
 */

import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { FFmpeg } from "npm:@ffmpeg/ffmpeg@0.12.10";

const BUCKET = "composer-frames";
const SUBDIR = "face-probe";
const MODEL_TAG = "ffmpeg.wasm@0.12";

// Single-thread core, no SharedArrayBuffer / no COEP needed.
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
const CORE_URL = `${CORE_BASE}/ffmpeg-core.js`;
const WASM_URL = `${CORE_BASE}/ffmpeg-core.wasm`;

// Range-Request ceiling: usually ~3 MB is enough for the first ~5s of a
// 720p H.264 clip. If the server rejects Range we fall back to a hard
// 8 MB cap on the full download.
const RANGE_BYTES = 3_000_000;
const MAX_FULL_BYTES = 8_000_000;

export interface ExtractInput {
  videoUrl: string;
  frameNumber: number;
  fps?: number; // default 30
  /** Hard ceiling on the whole extract (ms). Default 25s. */
  timeoutMs?: number;
}

export interface ExtractResult {
  ok: boolean;
  /** Public URL to the extracted JPEG, when ok. */
  frameUrl?: string;
  /** True when we re-used a previously uploaded frame. */
  cached?: boolean;
  /** Engine tag + latency for forensic logging. */
  model?: string;
  latencyMs?: number;
  /** Set when extraction failed for any reason. */
  reason?: string;
}

async function sha1Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function publicUrlExists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ── ffmpeg.wasm singleton per worker ─────────────────────────────────
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;
  ffmpegLoading = (async () => {
    const ff = new FFmpeg();
    await ff.load({ coreURL: CORE_URL, wasmURL: WASM_URL });
    ffmpegInstance = ff;
    return ff;
  })();
  try {
    return await ffmpegLoading;
  } finally {
    ffmpegLoading = null;
  }
}

async function fetchVideoBytes(
  videoUrl: string,
): Promise<{ bytes: Uint8Array } | { error: string }> {
  // Try Range first.
  try {
    const r = await fetch(videoUrl, {
      headers: { Range: `bytes=0-${RANGE_BYTES - 1}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok || r.status === 206) {
      const ab = await r.arrayBuffer();
      if (ab.byteLength > 0) return { bytes: new Uint8Array(ab) };
    }
  } catch {
    // fall through to full download
  }
  // Fallback: full download with hard cap.
  try {
    const r = await fetch(videoUrl, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return { error: `range_fetch_failed_http_${r.status}` };
    const ab = await r.arrayBuffer();
    if (ab.byteLength === 0) return { error: "range_fetch_empty" };
    const bytes = new Uint8Array(
      ab.byteLength > MAX_FULL_BYTES ? ab.slice(0, MAX_FULL_BYTES) : ab,
    );
    return { bytes };
  } catch (e) {
    return { error: `range_fetch_failed: ${(e as Error)?.message ?? String(e)}` };
  }
}

export async function extractFrameForFaceProbe(
  input: ExtractInput,
): Promise<ExtractResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { ok: false, reason: "supabase_service_env_missing" };
  }
  if (!input.videoUrl) {
    return { ok: false, reason: "no_video_url" };
  }
  if (!Number.isFinite(input.frameNumber)) {
    return { ok: false, reason: "no_frame_number" };
  }

  const fps = Number.isFinite(input.fps) && input.fps! > 0 ? Number(input.fps) : 30;
  const frame = Math.max(0, Math.round(input.frameNumber));
  // ffmpeg seek timestamp in seconds. Nudge forward 0.001s to avoid the
  // black 0-frame on some encoders.
  const tsSec = Math.max(0.001, frame / fps);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Deterministic cache path ─────────────────────────────────────
  // Keep the same key shape as v129.12 so previously cached frames hit.
  const key = await sha1Hex(`${input.videoUrl}:f${frame}@${fps}`);
  const storagePath = `${SUBDIR}/${key}.jpg`;
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = pub?.publicUrl ?? "";

  if (publicUrl && (await publicUrlExists(publicUrl))) {
    return { ok: true, frameUrl: publicUrl, cached: true, model: MODEL_TAG, latencyMs: 0 };
  }

  const started = Date.now();
  const deadline = started + (input.timeoutMs ?? 25_000);

  // ── 1. Fetch (range) MP4 bytes ───────────────────────────────────
  const fetched = await fetchVideoBytes(input.videoUrl);
  if ("error" in fetched) {
    return { ok: false, reason: fetched.error, latencyMs: Date.now() - started, model: MODEL_TAG };
  }
  if (Date.now() > deadline) {
    return { ok: false, reason: "extract_timeout_after_fetch", latencyMs: Date.now() - started, model: MODEL_TAG };
  }

  // ── 2. Run ffmpeg.wasm ───────────────────────────────────────────
  let ff: FFmpeg;
  try {
    ff = await getFfmpeg();
  } catch (e) {
    return {
      ok: false,
      reason: `ffmpeg_wasm_unavailable: ${(e as Error)?.message ?? String(e)}`,
      latencyMs: Date.now() - started,
      model: MODEL_TAG,
    };
  }

  const inName = `in_${key.slice(0, 12)}.mp4`;
  const outName = `out_${key.slice(0, 12)}.jpg`;
  try {
    await ff.writeFile(inName, fetched.bytes);
    // -ss before -i = fast seek to nearest keyframe (good enough for face
    // probe — we only need *a* frame near the ASD timestamp). -frames:v 1
    // takes a single frame, -q:v 3 = high JPEG quality.
    const code = await ff.exec([
      "-ss", tsSec.toFixed(3),
      "-i", inName,
      "-frames:v", "1",
      "-q:v", "3",
      outName,
    ]);
    if (code !== 0) {
      try { await ff.deleteFile(inName); } catch { /* ignore */ }
      return {
        ok: false,
        reason: `ffmpeg_exec_failed_code_${code}`,
        latencyMs: Date.now() - started,
        model: MODEL_TAG,
      };
    }
    const data = await ff.readFile(outName);
    // Cleanup in-memory FS
    try { await ff.deleteFile(inName); } catch { /* ignore */ }
    try { await ff.deleteFile(outName); } catch { /* ignore */ }

    const bytes = data instanceof Uint8Array
      ? data
      : new Uint8Array(data as ArrayBuffer);
    if (!bytes || bytes.byteLength === 0) {
      return {
        ok: false,
        reason: "ffmpeg_returned_empty_frame",
        latencyMs: Date.now() - started,
        model: MODEL_TAG,
      };
    }

    // ── 3. Upload to bucket ────────────────────────────────────────
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      });
    if (upErr) {
      return {
        ok: false,
        reason: `upload_failed: ${upErr.message}`,
        latencyMs: Date.now() - started,
        model: MODEL_TAG,
      };
    }

    return {
      ok: true,
      frameUrl: publicUrl,
      cached: false,
      model: MODEL_TAG,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      reason: `ffmpeg_exec_error: ${(e as Error)?.message ?? String(e)}`,
      latencyMs: Date.now() - started,
      model: MODEL_TAG,
    };
  }
}
