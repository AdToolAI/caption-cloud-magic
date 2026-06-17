/**
 * face-frame-extract (v129.11)
 *
 * Pulls a single JPEG/PNG out of an MP4 at a given timestamp using
 * Replicate's `lucataco/ffmpeg-extract-frame` model, uploads it to the
 * existing `composer-frames` storage bucket, and returns a public URL.
 *
 * Why: Lovable AI gateway routes google/gemini-* through OpenRouter, which
 * only accepts image URLs in `image_url` blocks. Passing a video/mp4 URL
 * deterministically returns HTTP 400, which silently disables the Sync.so
 * face-gate (see v129.10 post-mortem). Extracting a real frame makes the
 * Face-Probe deterministic.
 *
 * Cache strategy: deterministic storage path based on sha1(videoUrl + ":" +
 * frame). On a cache hit we HEAD the public URL and skip Replicate.
 *
 * NEVER throws — returns `{ ok: false, reason }` so callers can degrade
 * gracefully (probe_unavailable, dispatch proceeds unchecked).
 */

import Replicate from "npm:replicate@0.25.2";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const REPLICATE_MODEL = "lucataco/ffmpeg-extract-frame";
const BUCKET = "composer-frames";
const SUBDIR = "face-probe";

export interface ExtractInput {
  videoUrl: string;
  frameNumber: number;
  fps?: number; // default 30
  /** Hard ceiling on the Replicate call (ms). Default 25s. */
  timeoutMs?: number;
}

export interface ExtractResult {
  ok: boolean;
  /** Public URL to the extracted JPEG/PNG, when ok. */
  frameUrl?: string;
  /** True when we re-used a previously uploaded frame. */
  cached?: boolean;
  /** Replicate model + latency for forensic logging. */
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

export async function extractFrameForFaceProbe(
  input: ExtractInput,
): Promise<ExtractResult> {
  const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!REPLICATE_API_TOKEN) {
    return { ok: false, reason: "replicate_api_token_missing" };
  }
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
  // ffmpeg-extract-frame uses seconds. Nudge forward 0.001s to avoid the
  // black 0-frame on some encoders.
  const timestamp = Math.max(0.001, frame / fps);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Deterministic cache path ─────────────────────────────────────
  const key = await sha1Hex(`${input.videoUrl}:f${frame}@${fps}`);
  const storagePath = `${SUBDIR}/${key}.png`;
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = pub?.publicUrl ?? "";

  if (publicUrl && (await publicUrlExists(publicUrl))) {
    return { ok: true, frameUrl: publicUrl, cached: true, model: REPLICATE_MODEL, latencyMs: 0 };
  }

  // ── Replicate extract ─────────────────────────────────────────────
  const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
  const started = Date.now();
  let frameOutput: unknown;
  try {
    const runPromise = replicate.run(REPLICATE_MODEL as `${string}/${string}`, {
      input: { video: input.videoUrl, timestamp },
    });
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("replicate_timeout")), input.timeoutMs ?? 25_000),
    );
    frameOutput = await Promise.race([runPromise, timeout]);
  } catch (e) {
    return {
      ok: false,
      reason: `replicate_extract_failed: ${(e as Error)?.message ?? String(e)}`,
      latencyMs: Date.now() - started,
      model: REPLICATE_MODEL,
    };
  }

  const tmpUrl: string =
    typeof frameOutput === "string"
      ? frameOutput
      : Array.isArray(frameOutput)
      ? (frameOutput as string[])[0]
      : (frameOutput as { url?: () => string; })?.url?.() ?? (frameOutput as { url?: string })?.url ?? "";
  if (!tmpUrl || typeof tmpUrl !== "string") {
    return { ok: false, reason: "replicate_returned_no_url", latencyMs: Date.now() - started };
  }

  // ── Fetch + upload to permanent bucket ───────────────────────────
  let bytes: Uint8Array;
  try {
    const r = await fetch(tmpUrl, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) {
      return {
        ok: false,
        reason: `replicate_fetch_http_${r.status}`,
        latencyMs: Date.now() - started,
      };
    }
    bytes = new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    return {
      ok: false,
      reason: `replicate_fetch_error: ${(e as Error)?.message ?? String(e)}`,
      latencyMs: Date.now() - started,
    };
  }

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: "image/png",
      upsert: true,
      cacheControl: "31536000",
    });
  if (upErr) {
    return {
      ok: false,
      reason: `upload_failed: ${upErr.message}`,
      latencyMs: Date.now() - started,
    };
  }

  return {
    ok: true,
    frameUrl: publicUrl,
    cached: false,
    model: REPLICATE_MODEL,
    latencyMs: Date.now() - started,
  };
}
