/**
 * face-frame-extract (v129.23)
 *
 * Server-side probe-frame extraction for Sync.so face gates. v129.14 disabled
 * extraction after ffmpeg.wasm failed in Deno Edge; v129.23 brings back a
 * safe provider-based path so production dispatch can run the same snap probe
 * that the Forensics Sheet runs with browser-canvas frames.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL_TAG = "replicate:lucataco/ffmpeg-extract-frame@v129.23";
const REPLICATE_MODEL_URL = "https://api.replicate.com/v1/models/lucataco/ffmpeg-extract-frame/predictions";
const REPLICATE_POLL_TIMEOUT_MS = 75_000;

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
    const token = Deno.env.get("REPLICATE_API_TOKEN") ?? Deno.env.get("REPLICATE_API_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!input.videoUrl || !/^https?:\/\//i.test(input.videoUrl)) {
      return { ok: false, reason: "invalid_video_url", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }
    if (!token) {
      return { ok: false, reason: "replicate_token_missing", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }
    if (!supabaseUrl || !serviceKey) {
      return { ok: false, reason: "storage_env_missing", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    const fps = Math.max(1, Number(input.fps ?? 30));
    const frame = Math.max(0, Math.round(Number(input.frameNumber ?? 0)));
    const timestamp = Math.max(0.033, frame / fps);
    const userId = safeSegment(input.userId) || "system";
    const projectId = safeSegment(input.projectId) || "shared";
    const sceneId = safeSegment(input.sceneId) || "unknown-scene";
    const passIdx = Number.isFinite(Number(input.passIdx)) ? Math.max(0, Number(input.passIdx)) : 0;
    const cachePath = `${userId}/${projectId}/probe-frames/${sceneId}-p${passIdx + 1}-f${frame}.png`;

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: publicData } = supabase.storage.from("composer-frames").getPublicUrl(cachePath);
    const publicUrl = publicData?.publicUrl ?? "";
    if (publicUrl) {
      const cached = await fetch(publicUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5_000),
      }).catch(() => null);
      if (cached?.ok) {
        return { ok: true, frameUrl: publicUrl, cached: true, model: MODEL_TAG, latencyMs: Date.now() - t0 };
      }
    }

    const created = await fetch(REPLICATE_MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(input.timeoutMs ?? 20_000),
      body: JSON.stringify({ input: { video: input.videoUrl, timestamp } }),
    });
    const createdBody = await created.text().catch(() => "");
    if (!created.ok) {
      return {
        ok: false,
        reason: `replicate_create_${created.status}:${createdBody.slice(0, 240)}`,
        model: MODEL_TAG,
        latencyMs: Date.now() - t0,
      };
    }
    const createdJson = JSON.parse(createdBody || "{}") as any;
    const predictionId = String(createdJson?.id ?? "");
    if (!predictionId) {
      return { ok: false, reason: "replicate_no_prediction_id", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    const outputUrl = await pollReplicateFrame(token, predictionId);
    if (!outputUrl) {
      return { ok: false, reason: "replicate_no_output_url", model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }

    const imgResp = await fetch(outputUrl, { signal: AbortSignal.timeout(20_000) });
    if (!imgResp.ok) {
      return { ok: false, reason: `frame_fetch_${imgResp.status}`, model: MODEL_TAG, latencyMs: Date.now() - t0 };
    }
    const bytes = new Uint8Array(await imgResp.arrayBuffer());
    const upload = await supabase.storage.from("composer-frames").upload(cachePath, bytes, {
      contentType: contentTypeFromUrl(outputUrl),
      upsert: true,
      cacheControl: "86400",
    });
    if (upload.error) {
      return { ok: false, reason: `storage_upload:${upload.error.message}`, model: MODEL_TAG, latencyMs: Date.now() - t0 };
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

function safeSegment(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function contentTypeFromUrl(url: string): string {
  return /\.jpe?g($|\?)/i.test(url) ? "image/jpeg" : "image/png";
}

async function pollReplicateFrame(token: string, predictionId: string): Promise<string | null> {
  const deadline = Date.now() + REPLICATE_POLL_TIMEOUT_MS;
  let delay = 1500;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(5000, delay + 500);
    const r = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const txt = await r.text().catch(() => "");
    if (!r.ok) throw new Error(`replicate_poll_${r.status}:${txt.slice(0, 180)}`);
    const j = JSON.parse(txt || "{}") as any;
    const status = String(j?.status ?? "");
    if (status === "succeeded") {
      const out = j?.output;
      if (typeof out === "string") return out;
      if (Array.isArray(out) && typeof out[0] === "string") return out[0];
      if (typeof out?.url === "string") return out.url;
      return null;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error(`replicate_${status}:${String(j?.error ?? "unknown").slice(0, 180)}`);
    }
  }
  throw new Error(`replicate_poll_timeout_${Math.round(REPLICATE_POLL_TIMEOUT_MS / 1000)}s`);
}
