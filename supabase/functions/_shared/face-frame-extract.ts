/**
 * face-frame-extract (v251-anchor-first-only, no replicate)
 *
 * v250 briefly re-introduced a Replicate `lucataco/ffmpeg-extract-frame` call
 * to extract still frames from rendered MP4s. That path was rejected — it
 * was previously error-prone and violated our AWS-only policy for
 * face/frame work (AWS Rekognition on the anchor is our sole detector path,
 * see mem://architecture/lipsync/v156-anchor-first-detection).
 *
 * v251 removes Replicate entirely:
 *   1. If the caller passed a `prebuiltFrameUrl` (client-canvas capture),
 *      that path is used directly by the Face-Gate — this helper is not
 *      invoked.
 *   2. If a deterministic frame was previously cached in `composer-frames`
 *      at `{userId}/{projectId}/probe-frames/{sceneId}-p{passIdx+1}-f{frame}.png`,
 *      we return a signed URL for that cache entry.
 *   3. Otherwise we return `ok: false` with a clean reason. The caller
 *      short-circuits to `FACE_GATE_PROBE_UNAVAILABLE` and dispatch
 *      proceeds unchecked, exactly like v129.11 behaviour. Anchor-First
 *      (v156) already covers every current dialog scene via
 *      `lock_reference_url` / `reference_image_url` at the plate-face
 *      detector; no server-side MP4 frame grab is needed.
 *
 * No Replicate. No lucataco. No ffmpeg calls. Ever.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL_TAG = "v251-anchor-first-only";

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

  try {
    if (!supabaseUrl || !serviceKey) {
      return {
        ok: false,
        reason: "v251_anchor_missing_probe_unavailable:storage_env_missing",
        model: MODEL_TAG,
        latencyMs: Date.now() - t0,
      };
    }

    const frame = Math.max(0, Math.round(Number(input.frameNumber ?? 0)));
    const userId = safeSegment(input.userId) || "system";
    const projectId = safeSegment(input.projectId) || "shared";
    const sceneId = safeSegment(input.sceneId) || "unknown-scene";
    const passIdx = Number.isFinite(Number(input.passIdx))
      ? Math.max(0, Number(input.passIdx))
      : 0;
    const cachePath = `${userId}/${projectId}/probe-frames/${sceneId}-p${passIdx + 1}-f${frame}.png`;

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Deterministic cache hit — a prior client-canvas upload landed here.
    const cached = await tryCacheHit(supabase, cachePath);
    if (cached) {
      return {
        ok: true,
        frameUrl: cached,
        cached: true,
        model: MODEL_TAG,
        latencyMs: Date.now() - t0,
        reason: "v251_anchor_bytes_ok:cache_hit",
      };
    }

    // No server-side MP4 extraction. AWS Rekognition runs on the anchor
    // frame in plate-face-detect; no second network hop is required here.
    return {
      ok: false,
      reason: "v251_anchor_missing_probe_unavailable:no_cache_no_server_extract",
      model: MODEL_TAG,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      reason: `v251_anchor_missing_probe_unavailable:${(e as Error)?.message ?? String(e)}`,
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

function safeSegment(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
