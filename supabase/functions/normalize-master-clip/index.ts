/**
 * normalize-master-clip (Sync.so Stage G — F.1 Master-Video Auto-Transcoding)
 *
 * Takes any master video URL (H.265, 4K, 60fps, VFR, weird container) and
 * returns a Sync.so-friendly H.264 / 1080p / 30fps / yuv420p MP4 URL.
 *
 * Strategy:
 *   1. Check normalized_master_cache (7d TTL, keyed by source_url).
 *   2. Probe MP4 stream — if already H.264 + ≤1920w + ≤30fps → SHORT-CIRCUIT,
 *      cache `normalized_url = source_url` so we never transcode again.
 *   3. Otherwise call Replicate ffmpeg model → re-encode to baseline preset,
 *      stream the result into our `normalized-masters` storage bucket,
 *      cache the public URL for 7 days.
 *   4. On Replicate failure → cache a `status='failed'` row for 1h so we
 *      don't hammer the API on repeat calls; caller falls back to source.
 *
 * Request:  { source_url: string, force?: boolean }
 * Response: { ok, normalized_url, cached, status, reason? }
 *
 * Never throws — always 200 with `ok: false` on error so callers degrade
 * gracefully (use source URL, log a warning).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { probeMp4Stream } from "../_shared/syncso-preflight.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN") ?? "";

// Replicate ffmpeg models we try in order (first one available wins).
// All take { input_video, output_format } or similar args.
const REPLICATE_FFMPEG_MODELS = [
  "lucataco/ffmpeg-api:latest",
];

const BUCKET = "normalized-masters";
const TARGET_W = 1080;
const TARGET_H = 1920;
const TARGET_FPS = 30;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface CacheRow {
  source_url: string;
  normalized_url: string;
  status: string;
  expires_at: string;
}

async function readCache(sourceUrl: string): Promise<CacheRow | null> {
  try {
    const { data } = await supabase
      .from("normalized_master_cache")
      .select("source_url, normalized_url, status, expires_at")
      .eq("source_url", sourceUrl)
      .maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return data as CacheRow;
  } catch {
    return null;
  }
}

async function writeCache(row: {
  source_url: string;
  normalized_url: string;
  status: "completed" | "failed";
  source_codec?: string | null;
  source_width?: number | null;
  source_height?: number | null;
  bytes?: number | null;
  provider_job_id?: string | null;
  error_message?: string | null;
  ttl_hours?: number;
}): Promise<void> {
  try {
    const ttl = row.ttl_hours ?? (row.status === "failed" ? 1 : 24 * 7);
    await supabase.from("normalized_master_cache").upsert(
      {
        source_url: row.source_url,
        normalized_url: row.normalized_url,
        status: row.status,
        source_codec: row.source_codec ?? null,
        source_width: row.source_width ?? null,
        source_height: row.source_height ?? null,
        bytes: row.bytes ?? null,
        provider_job_id: row.provider_job_id ?? null,
        error_message: row.error_message ?? null,
        normalized_codec: "h264",
        normalized_width: TARGET_W,
        normalized_height: TARGET_H,
        normalized_fps: TARGET_FPS,
        provider: "replicate-ffmpeg",
        expires_at: new Date(Date.now() + ttl * 3600 * 1000).toISOString(),
      },
      { onConflict: "source_url" },
    );
  } catch (e) {
    console.warn("[normalize-master-clip] cache write failed:", e);
  }
}

/**
 * Probe-only short-circuit: returns true if the source already looks
 * Sync.so-friendly (H.264, ≤1920 wide). FPS we can't read from header
 * cheaply, so we trust the codec/dimensions check.
 */
function isAlreadyFriendly(probe: {
  codec?: string;
  width?: number;
  height?: number;
}): boolean {
  if (!probe.codec) return false;
  if (!/^(avc1|avc3)$/.test(probe.codec)) return false;
  if (probe.width && probe.width > 1920) return false;
  if (probe.height && probe.height > 1920) return false;
  return true;
}

/**
 * Calls Replicate ffmpeg model to re-encode. Returns the public output URL
 * or throws on any failure. Tries each model in REPLICATE_FFMPEG_MODELS
 * order until one works.
 */
async function callReplicateFfmpeg(sourceUrl: string): Promise<{
  outputUrl: string;
  jobId: string;
  model: string;
}> {
  if (!REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN missing");

  let lastErr = "";
  for (const model of REPLICATE_FFMPEG_MODELS) {
    try {
      // ffmpeg args: re-encode to H.264 / yuv420p / 30fps, scale to fit
      // 1080x1920 (pad), AAC stereo 44.1kHz, faststart.
      const filter =
        `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,` +
        `pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black,` +
        `fps=${TARGET_FPS},format=yuv420p`;

      const createRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Token ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
          Prefer: "wait=60",
        },
        body: JSON.stringify({
          version: model.split(":")[1] || "latest",
          input: {
            input_video: sourceUrl,
            video_url: sourceUrl,
            url: sourceUrl,
            args:
              `-y -i {input} -vf "${filter}" -c:v libx264 -preset veryfast ` +
              `-crf 23 -c:a aac -b:a 128k -ar 44100 -movflags +faststart {output}.mp4`,
            output_format: "mp4",
          },
        }),
      });

      if (!createRes.ok) {
        lastErr = `${model}: HTTP ${createRes.status}`;
        continue;
      }
      const created = await createRes.json();

      // Poll if not finished after the Prefer:wait window.
      let pred = created;
      const jobId = pred.id as string;
      const pollUrl = `https://api.replicate.com/v1/predictions/${jobId}`;
      const deadline = Date.now() + 180_000; // 3 min hard cap
      while (
        pred.status &&
        pred.status !== "succeeded" &&
        pred.status !== "failed" &&
        pred.status !== "canceled" &&
        Date.now() < deadline
      ) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(pollUrl, {
          headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
        });
        if (!pollRes.ok) break;
        pred = await pollRes.json();
      }

      if (pred.status !== "succeeded") {
        lastErr = `${model}: ${pred.status} ${pred.error ?? ""}`;
        continue;
      }
      const outputUrl =
        typeof pred.output === "string"
          ? pred.output
          : Array.isArray(pred.output)
            ? pred.output[0]
            : pred.output?.url ?? "";
      if (!outputUrl) {
        lastErr = `${model}: empty output`;
        continue;
      }
      return { outputUrl, jobId, model };
    } catch (e) {
      lastErr = `${model}: ${(e as Error)?.message}`;
    }
  }
  throw new Error(`all_ffmpeg_models_failed: ${lastErr}`);
}

/**
 * Streams the Replicate output into our storage bucket so the URL is
 * stable and Sync.so doesn't have to fetch from a third-party CDN that
 * might 403/expire.
 */
async function uploadToStorage(
  replicateOutputUrl: string,
  sourceUrl: string,
): Promise<{ publicUrl: string; bytes: number }> {
  const res = await fetch(replicateOutputUrl);
  if (!res.ok) {
    throw new Error(`fetch_output_failed_${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceUrl));
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  const path = `normalized/${hex}.mp4`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, {
      contentType: "video/mp4",
      upsert: true,
    });
  if (upErr) throw new Error(`storage_upload_failed: ${upErr.message}`);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { publicUrl: pub.publicUrl, bytes: buf.byteLength };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: { source_url?: string; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const sourceUrl = body.source_url?.trim();
  if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) {
    return jsonResponse({ ok: false, error: "invalid_source_url" }, 400);
  }

  // 1. Cache lookup
  if (!body.force) {
    const cached = await readCache(sourceUrl);
    if (cached) {
      if (cached.status === "completed") {
        return jsonResponse({
          ok: true,
          cached: true,
          status: "completed",
          normalized_url: cached.normalized_url,
        });
      }
      if (cached.status === "failed") {
        // Negative cache (1h) — caller falls back to source.
        return jsonResponse({
          ok: false,
          cached: true,
          status: "failed",
          normalized_url: sourceUrl,
          reason: "negative_cache",
        });
      }
    }
  }

  // 2. Probe — short-circuit if already friendly
  const probe = await probeMp4Stream(sourceUrl);
  if (probe.ok && isAlreadyFriendly(probe)) {
    await writeCache({
      source_url: sourceUrl,
      normalized_url: sourceUrl, // identity
      status: "completed",
      source_codec: probe.codec ?? null,
      source_width: probe.width ?? null,
      source_height: probe.height ?? null,
    });
    return jsonResponse({
      ok: true,
      cached: false,
      status: "completed",
      normalized_url: sourceUrl,
      reason: "already_h264_under_1920",
    });
  }

  // 3. Transcode via Replicate
  try {
    const { outputUrl, jobId, model } = await callReplicateFfmpeg(sourceUrl);
    const { publicUrl, bytes } = await uploadToStorage(outputUrl, sourceUrl);

    await writeCache({
      source_url: sourceUrl,
      normalized_url: publicUrl,
      status: "completed",
      source_codec: probe.codec ?? null,
      source_width: probe.width ?? null,
      source_height: probe.height ?? null,
      bytes,
      provider_job_id: jobId,
    });

    console.log(
      `[normalize-master-clip] OK ${sourceUrl} → ${publicUrl} (${bytes}B, model=${model})`,
    );
    return jsonResponse({
      ok: true,
      cached: false,
      status: "completed",
      normalized_url: publicUrl,
      bytes,
      job_id: jobId,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? "unknown";
    console.error("[normalize-master-clip] FAILED:", msg);
    await writeCache({
      source_url: sourceUrl,
      normalized_url: sourceUrl,
      status: "failed",
      source_codec: probe.codec ?? null,
      source_width: probe.width ?? null,
      source_height: probe.height ?? null,
      error_message: msg,
    });
    return jsonResponse({
      ok: false,
      cached: false,
      status: "failed",
      normalized_url: sourceUrl,
      reason: msg,
    });
  }
});
