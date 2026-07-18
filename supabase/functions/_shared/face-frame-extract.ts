/**
 * face-frame-extract (v250-server-frame-extract-live)
 *
 * Server-side MP4 frame extraction via Replicate `lucataco/ffmpeg-extract-frame`.
 * v129.23.2 disabled this path entirely; v250 restores it so the Face-Gate,
 * v247 mouth-anchored zoom, and v249 metric-ladder actually receive a JPEG
 * at dispatch time — independent of whether the client uploaded a canvas
 * frame.
 *
 * Contract
 * ────────
 *   1. Cache hit: reuse the deterministic path in `composer-frames` under
 *      `{userId}/{projectId}/probe-frames/{sceneId}-p{passIdx+1}-f{frame}.png`.
 *   2. Cache miss: call Replicate with the plate URL + timestamp, download
 *      the returned PNG, upload it to the cache path, return the public URL.
 *   3. Hard timeout: 8s total (Replicate + upload). Any failure returns
 *      `ok: false` with a reason string — the caller falls back to
 *      `FACE_GATE_PROBE_UNAVAILABLE` (unblocked dispatch).
 *
 * RLS: composer-frames enforces user-id-first paths. `safeSegment` sanitises
 * every path part; a missing userId collapses to `system` (service role
 * bucket write).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import Replicate from "npm:replicate@0.25.2";

const MODEL_TAG = "replicate:lucataco/ffmpeg-extract-frame@v250";
const REPLICATE_MODEL = "lucataco/ffmpeg-extract-frame";
const HARD_TIMEOUT_MS = 8_000;

export interface ExtractInput {
  videoUrl: string;
  frameNumber: number;
  fps?: number;
  timeoutMs?: number;
  /** Optional stable path parts for composer-frames cache. User ID must be first segment. */
  userId?: string;
  projectId?: string;
  sceneId?: string;
  passIdx?: number;
}

export interface ExtractResult {
  ok: boolean;
  frameUrl?: string;
  cached?: boolean;
  model?: string;
  latencyMs?: number;
  reason?: string;
}

export async function extractFrameForFaceProbe(
  input: ExtractInput,
): Promise<ExtractResult> {
  const t0 = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const replicateToken =
    Deno.env.get("REPLICATE_API_TOKEN") ?? Deno.env.get("REPLICATE_API_KEY") ?? "";

  try {
    if (!input.videoUrl || !/^https?:\/\//i.test(input.videoUrl)) {
      return { ok: false, reason: "invalid_video_url", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }
    if (!supabaseUrl || !serviceKey) {
      return { ok: false, reason: "storage_env_missing", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    const frame = Math.max(0, Math.round(Number(input.frameNumber ?? 0)));
    const fps = Number.isFinite(Number(input.fps)) && Number(input.fps) > 0 ? Number(input.fps) : 30;
    const userId = safeSegment(input.userId) || "system";
    const projectId = safeSegment(input.projectId) || "shared";
    const sceneId = safeSegment(input.sceneId) || "unknown-scene";
    const passIdx = Number.isFinite(Number(input.passIdx)) ? Math.max(0, Number(input.passIdx)) : 0;
    const cachePath = `${userId}/${projectId}/probe-frames/${sceneId}-p${passIdx + 1}-f${frame}.png`;

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Stage 1 — cache hit? ────────────────────────────────────────
    const cached = await tryCacheHit(supabase, cachePath);
    if (cached) {
      return { ok: true, frameUrl: cached, cached: true, model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    // ── Stage 2 — server-side extract via Replicate ────────────────
    if (!replicateToken) {
      return { ok: false, reason: "replicate_token_missing", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    const timestamp = Math.max(0.05, frame / fps);
    const budget = Math.min(Math.max(1_000, Number(input.timeoutMs ?? HARD_TIMEOUT_MS)), HARD_TIMEOUT_MS);
    const deadline = t0 + budget;

    const replicate = new Replicate({ auth: replicateToken });
    const framePngUrl = await withDeadline(
      (async () => {
        const out = await replicate.run(REPLICATE_MODEL as `${string}/${string}`, {
          input: { video: input.videoUrl, timestamp },
        });
        // Replicate returns a URL string, an array of URLs, or a FileOutput-like object.
        const url =
          typeof out === "string"
            ? out
            : Array.isArray(out)
              ? out[0]
              : ((out as { url?: unknown })?.url instanceof Function
                  ? String(((out as { url: () => unknown }).url)())
                  : ((out as { url?: string })?.url ?? ""));
        return typeof url === "string" ? url : "";
      })(),
      deadline,
      "replicate_timeout",
    );

    if (!framePngUrl) {
      return { ok: false, reason: "replicate_no_frame_url", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    // ── Stage 3 — download + upload to composer-frames ─────────────
    const pngRes = await fetch(framePngUrl, { signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())) });
    if (!pngRes.ok) {
      return { ok: false, reason: `frame_download_failed_${pngRes.status}`, model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }
    const bytes = new Uint8Array(await pngRes.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
      .from("composer-frames")
      .upload(cachePath, bytes, {
        contentType: "image/png",
        upsert: true,
        cacheControl: "31536000",
      });
    if (uploadErr) {
      return { ok: false, reason: `storage_upload_failed:${uploadErr.message}`, model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    const { data: pub } = supabase.storage.from("composer-frames").getPublicUrl(cachePath);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      // Fall back to a signed URL if the bucket is not public.
      const signed = await supabase.storage
        .from("composer-frames")
        .createSignedUrl(cachePath, 60 * 30);
      if (signed.error || !signed.data?.signedUrl) {
        return { ok: false, reason: "storage_url_unavailable", model: MODEL_TAG, latencyMs: Date.now() - t0 };
      }
      return { ok: true, frameUrl: signed.data.signedUrl, cached: false, model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    return { ok: true, frameUrl: publicUrl, cached: false, model: MODEL_TAG, latencyMs: Date.now() - t0 };
  } catch (e) {
    return {
      ok: false,
      reason: (e as Error)?.message ?? String(e),
      model: MODEL_TAG,
      latencyMs: Date.now() - t0,
    };
  }
}

async function tryCacheHit(
  supabase: ReturnType<typeof createClient>,
  cachePath: string,
): Promise<string | null> {
  try {
    const signed = await supabase.storage
      .from("composer-frames")
      .createSignedUrl(cachePath, 60 * 30);
    if (signed.error || !signed.data?.signedUrl) return null;
    const head = await fetch(signed.data.signedUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(3_000),
    }).catch(() => null);
    return head?.ok ? signed.data.signedUrl : null;
  } catch {
    return null;
  }
}

async function withDeadline<T>(p: Promise<T>, deadline: number, timeoutReason: string): Promise<T> {
  const remaining = Math.max(1, deadline - Date.now());
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(timeoutReason)), remaining)),
  ]);
}

function safeSegment(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
