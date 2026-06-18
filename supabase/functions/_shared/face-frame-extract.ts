/**
 * face-frame-extract (v129.23.2)
 *
 * Server-side MP4 frame extraction is intentionally disabled. The supported
 * path is client-side Canvas extraction into the `composer-frames` bucket
 * (user ID as first path segment), then passing that JPEG/PNG URL into the
 * Sync.so face gate. This helper only checks whether such a cached frame is
 * already present; it never calls Replicate/lucataco.
 */

const MODEL_TAG = "client-canvas:composer-frames@v129.23.2";

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
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    if (!input.videoUrl || !/^https?:\/\//i.test(input.videoUrl)) {
      return { ok: false, reason: "invalid_video_url", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }
    if (!supabaseUrl) {
      return { ok: false, reason: "storage_env_missing", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    const frame = Math.max(0, Math.round(Number(input.frameNumber ?? 0)));
    const userId = safeSegment(input.userId) || "system";
    const projectId = safeSegment(input.projectId) || "shared";
    const sceneId = safeSegment(input.sceneId) || "unknown-scene";
    const passIdx = Number.isFinite(Number(input.passIdx)) ? Math.max(0, Number(input.passIdx)) : 0;
    const cachePath = `${userId}/${projectId}/probe-frames/${sceneId}-p${passIdx + 1}-f${frame}.png`;

    const publicUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/composer-frames/${cachePath}`;
    const cached = await fetch(publicUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);
    if (cached?.ok) {
      return { ok: true, frameUrl: publicUrl, cached: true, model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }
    return {
      ok: false,
      reason: "server_extract_disabled_use_client_canvas",
      model: MODEL_TAG,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      reason: (e as Error)?.message ?? String(e),
      model: MODEL_TAG,
      latencyMs: Date.now() - t0,
    };
  }
}

function safeSegment(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
