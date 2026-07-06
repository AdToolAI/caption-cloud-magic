/**
 * pass-face-preclip.ts — Per-Pass Single-Face Preclip for v5 fan-out
 *
 * v68 (June 2026):
 * For 3+ speaker dialog scenes the v5 fan-out pipeline used to send the full
 * Multi-Face scene plate to Sync.so with `active_speaker_detection.coordinates`
 * (or `bounding_boxes`) pointing at one of N faces. Sync.so (both lipsync-2-pro
 * AND sync-3) silently returned `An unknown error occurred.` on 4-speaker
 * plates regardless of which retry variant we used.
 *
 * The v21 legacy per-turn pipeline already had a working pattern: render a
 * tight single-face SQUARE CROP via Remotion Lambda, send THAT to Sync.so
 * with `auto_detect:true` (no ambiguity — the crop contains exactly one
 * face), and overlay the result back onto the master plate at the original
 * (cropX, cropY, cropSize) region with a soft circular mask via
 * `DialogStitchVideo.shots[].crop`.
 *
 * This helper wires that legacy infrastructure into the v5 fan-out pass loop.
 * It is synchronous from the caller's perspective: dispatches the Lambda
 * render, polls `video_renders.video_url` every 2s up to 90s, returns the
 * preclip URL + crop region. Idempotent: if the pass already has a preclip
 * URL stored, reuses it without re-rendering.
 *
 * Notes:
 *  - We DO NOT use render-dialog-turn directly because that function writes
 *    into `dialog_shots.shots[]` (v4 schema). Our v5 fan-out uses
 *    `dialog_shots.passes[]`, so we drive the Lambda render directly via
 *    invoke-remotion-render and read video_renders.video_url.
 *  - `audio_tight.windows_secs` is the source of the preclip's render
 *    window. The preclip duration matches the voiced turn duration; the
 *    surrounding silence in the original plate is filled back in by the
 *    audio-mux Lambda overlay step.
 */

import { computeFaceCrop, FaceCropRegion } from "./face-crop.ts";
import { appendWebhookToken } from "./webhook-auth.ts";
import { DEFAULT_BUCKET_NAME } from "./aws-lambda.ts";

export interface PassPreclipInput {
  sceneId: string;
  projectId: string;
  userId: string;
  passIdx: number;
  /** Master plate URL (full scene). */
  masterVideoUrl: string;
  /** Source-master pixel dims. */
  srcWidth: number;
  srcHeight: number;
  /** Speaker face coords in source-master pixel space. */
  coords: [number, number];
  /** Optional face bbox in source-master pixel space [x1,y1,x2,y2]. */
  bbox?: [number, number, number, number] | null;
  /** v76 — Face centers of the OTHER speakers on the same plate. Used to
   *  cap the crop edge so it never includes a neighbor's face. */
  siblingCoords?: Array<[number, number]> | null;
  /** Render window for this speaker's turn(s) in scene seconds. */
  startSec: number;
  endSec: number;
  /**
   * v116 (Fix B — Face-Gate Self-Repair). Multiplier applied to the
   * computed crop `size` AFTER computeFaceCrop. Used by the dispatcher
   * to re-render a wider crop (more headroom/chinroom) when the prior
   * preclip's face-gate returned `faces=0` (face was just outside the
   * crop). 1.0 = no change (default). 1.4 / 1.8 are the dispatcher's
   * standard repair steps. Crop is re-centered on `coords` and clamped
   * to source bounds; never includes a neighbor's coordinate.
   */
  cropExpansionFactor?: number;
}

export interface PassPreclipResult {
  ok: boolean;
  preclipUrl?: string;
  preclipRenderId?: string;
  crop?: FaceCropRegion;
  /** Window passed to Lambda (preclip plays t=0 → endSec-startSec). */
  durationSec?: number;
  /** v163 — actual fps the preclip was rendered at. Required by callers
   *  building Sync.so `bounding_boxes_url` JSON: the array length MUST
   *  match the dispatched video's real frame count, NOT the legacy 24fps
   *  plate assumption. Mismatch → opaque `generation_unknown_error`. */
  fps?: number;
  /** v163 — exact Remotion render frame count (`durationInFrames`). */
  frameCount?: number;
  error?: string;
  errorClass?: "dispatch_failed" | "lambda_failed" | "poll_timeout" | "invalid_input";
}


const FPS = 30;
// v188 (Phase 1.3) — halved from 2000ms to shave ~1s detection latency on
// short renders. No cost impact; DB read only.
const POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_TIMEOUT_MS = 90_000;

function evenDimension(value: number, fallback: number): number {
  const n = Number(value);
  const safe = Number.isFinite(n) && n >= 64 ? Math.round(n) : fallback;
  return safe % 2 === 0 ? safe : safe - 1;
}

/**
 * Render a single-face preclip via Remotion Lambda and wait for it to finish.
 * Caller should already have stored `preclip_url` + `preclip_crop` on the
 * pass if a prior call succeeded (idempotency lives at the call site so we
 * don't have to re-read composer_scenes here).
 */
export async function renderPassFacePreclip(
  supabase: any,
  serviceKey: string,
  supabaseUrl: string,
  input: PassPreclipInput,
  pollTimeoutMs: number = DEFAULT_POLL_TIMEOUT_MS,
): Promise<PassPreclipResult> {
  const {
    sceneId,
    projectId,
    userId,
    passIdx,
    masterVideoUrl,
    srcWidth,
    srcHeight,
    coords,
    bbox,
    siblingCoords,
    startSec,
    endSec,
    cropExpansionFactor,
  } = input;

  if (!masterVideoUrl || !Number.isFinite(srcWidth) || !Number.isFinite(srcHeight)) {
    return { ok: false, error: "invalid_master_dims", errorClass: "invalid_input" };
  }
  if (!Array.isArray(coords) || coords.length !== 2) {
    return { ok: false, error: "missing_coords", errorClass: "invalid_input" };
  }
  const dur = Math.max(0.2, endSec - startSec);
  if (!Number.isFinite(dur)) {
    return { ok: false, error: "invalid_window", errorClass: "invalid_input" };
  }

  const sW = evenDimension(srcWidth, 1280);
  const sH = evenDimension(srcHeight, 720);
  const crop0 = computeFaceCrop(coords, bbox ?? null, sW, sH, 512, siblingCoords ?? null);

  // v116 (Fix B) — expand the crop on repair retries. We multiply `size`
  // around the same center coords and re-clamp to source bounds. This is
  // the cheapest way to give Sync.so + Gemini face-detect more margin
  // when the original crop missed the face. We deliberately ignore the
  // neighbor cap on expansion: when faces=0 in the first crop, including
  // a sibling face is preferable to producing a useless empty crop —
  // the downstream face-gate will still validate count===1.
  const expandFactor = Number.isFinite(cropExpansionFactor) && (cropExpansionFactor as number) > 1
    ? Math.min(2.5, Number(cropExpansionFactor))
    : 1;
  let expandedSize = crop0.size;
  let expandedX = crop0.x;
  let expandedY = crop0.y;
  if (expandFactor > 1) {
    const centerX = crop0.x + crop0.size / 2;
    const centerY = crop0.y + crop0.size / 2;
    const target = Math.min(Math.min(sW, sH), Math.round(crop0.size * expandFactor));
    expandedSize = target % 2 === 0 ? target : target - 1;
    expandedX = Math.max(0, Math.min(sW - expandedSize, Math.round(centerX - expandedSize / 2)));
    expandedY = Math.max(0, Math.min(sH - expandedSize, Math.round(centerY - expandedSize / 2)));
    expandedX = expandedX % 2 === 0 ? expandedX : Math.max(0, expandedX - 1);
    expandedY = expandedY % 2 === 0 ? expandedY : Math.max(0, expandedY - 1);
  }

  // v112 — Sync.so docs explicitly require ≥480p for reliable face detection
  // (sync.so/docs/compatibility-and-tips/improving-lip-sync-quality:
  // "Use at least 480p resolution for reliable face detection. […]
  //  We recommend 1080p as the best balance"). The v109 native-resolution
  // policy (max(256, crop.size)) frequently produced 220–360px preclips,
  // well under the 480p floor → sync-3 completed COMPLETED but emitted the
  // preclip unchanged ("mouths don't move"). v112 targets a 720p floor
  // (safety margin above 480p) and caps at 1280p so cost/latency stay
  // bounded. Lanczos upscale lives in the Remotion DialogTurnFaceCropVideo
  // composition via width/height inputProps below.
  const nativeOut = Math.min(1280, Math.max(720, expandedSize));
  const evenNative = nativeOut % 2 === 0 ? nativeOut : nativeOut - 1;
  const crop = { x: expandedX, y: expandedY, size: expandedSize, outputSize: evenNative };
  const outW = crop.outputSize;
  const outH = crop.outputSize;
  const durationInFrames = Math.max(6, Math.ceil(dur * FPS));

  const t0 = Date.now();

  // v188 (Phase 1.2) — Reuse-Guard. If an earlier Lambda run for THIS exact
  // scene+pass with the SAME crop geometry finished within the last 15 min
  // (typical case: previous compose-dialog-segments hit its 180s poll timeout
  // but the Lambda kept rendering and completed at ~190s), reuse that
  // rendered mp4 instead of paying for a duplicate Lambda render. The
  // `face_crop.size` match keeps v116 face-gate expansion retries (which
  // change `size`) properly cache-missing.
  try {
    const cutoffIso = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: prior } = await supabase
      .from("video_renders")
      .select("render_id, video_url, content_config, started_at")
      .eq("source", "dialog-pass-preclip")
      .eq("status", "completed")
      .contains("content_config", {
        composer_scene_id: sceneId,
        pass_idx: passIdx,
        face_crop: { size: crop.size },
      })
      .gte("started_at", cutoffIso)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.video_url) {
      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v188_reuse_hit render=${prior.render_id} url=…${String(prior.video_url).slice(-60)} dispatch_ms=0 poll_wait_ms=0 total_ms=${Date.now() - t0}`,
      );
      return {
        ok: true,
        preclipUrl: prior.video_url,
        preclipRenderId: prior.render_id,
        crop,
        durationSec: dur,
        fps: FPS,
        frameCount: durationInFrames,
      };
    }
  } catch (reuseErr) {
    // Non-fatal — cache miss falls through to normal dispatch.
    console.warn(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v188_reuse_lookup_failed: ${(reuseErr as Error)?.message ?? String(reuseErr)}`,
    );
  }

  const renderId = crypto.randomUUID();
  const outName = `dialog-pass-preclip-${sceneId}-p${passIdx}-${Date.now()}.mp4`;

  const inputProps = {
    masterVideoUrl,
    startSec,
    endSec,
    outputSize: crop.outputSize,
    srcWidth: sW,
    srcHeight: sH,
    cropX: crop.x,
    cropY: crop.y,
    cropSize: crop.size,
  };

  const { error: insertErr } = await supabase
    .from("video_renders")
    .insert({
      render_id: renderId,
      project_id: projectId,
      user_id: userId,
      bucket_name: DEFAULT_BUCKET_NAME,
      source: "dialog-pass-preclip",
      status: "pending",
      started_at: new Date().toISOString(),
      format_config: { format: "mp4", aspect_ratio: "1:1", width: outW, height: outH, fps: FPS },
      content_config: {
        out_name: outName,
        durationInFrames,
        fps: FPS,
        width: outW,
        height: outH,
        composer_scene_id: sceneId,
        pass_idx: passIdx,
        face_crop: { x: crop.x, y: crop.y, size: crop.size, outputSize: crop.outputSize },
      },
      subtitle_config: {},
    });
  if (insertErr) {
    return { ok: false, error: `insert_render:${insertErr.message}`, errorClass: "dispatch_failed" };
  }

  const webhookUrl = appendWebhookToken(`${supabaseUrl}/functions/v1/remotion-webhook`);
  const lambdaPayload: Record<string, unknown> = {
    type: "start",
    serveUrl: Deno.env.get("REMOTION_SERVE_URL") || "",
    composition: "DialogTurnFaceCropVideo",
    inputProps: { type: "payload", payload: JSON.stringify(inputProps) },
    codec: "h264",
    imageFormat: "jpeg",
    // v129.23.3 — force TV-range yuv420p instead of jpeg-range yuvj420p.
    // Sync.so's decoder/face-tracker silently fails with
    // generation_unknown_error on yuvj420p, even though ffmpeg/Chrome
    // accept it. Without these two fields the Lambda h264 encoder
    // inherits PC-range from the JPEG frame source.
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    maxRetries: 1,
    privacy: "public",
    logLevel: "warn",
    outName,
    bucketName: DEFAULT_BUCKET_NAME,
    width: outW,
    height: outH,
    fps: FPS,
    durationInFrames,
    frameRange: [0, durationInFrames - 1],
    muted: true,
    audioCodec: "aac",
    scale: 1,
    envVariables: {},
    chromiumOptions: {},
    timeoutInMilliseconds: 180_000,
    concurrencyPerLambda: 1,
    downloadBehavior: { type: "play-in-browser" },

    webhook: {
      url: webhookUrl,
      secret: null,
      customData: {
        pending_render_id: renderId,
        out_name: outName,
        user_id: userId,
        // Use a distinct source so remotion-webhook does NOT try to patch
        // v4 dialog_shots.shots[] (which doesn't exist for this scene).
        // The webhook will still mark video_renders.completed; we poll for it.
        source: "dialog-pass-preclip",
        composer_scene_id: sceneId,
        composer_project_id: projectId,
        pass_idx: passIdx,
      },
    },
  };

  const invokeResp = await fetch(`${supabaseUrl}/functions/v1/invoke-remotion-render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ lambdaPayload, pendingRenderId: renderId, userId }),
  });
  if (!invokeResp.ok) {
    const t = await invokeResp.text().catch(() => "");
    await supabase
      .from("video_renders")
      .update({
        status: "failed",
        error_message: `invoke ${invokeResp.status}: ${t}`.slice(0, 400),
        completed_at: new Date().toISOString(),
      })
      .eq("render_id", renderId);
    return {
      ok: false,
      error: `invoke_${invokeResp.status}:${t.slice(0, 200)}`,
      errorClass: "dispatch_failed",
      preclipRenderId: renderId,
      crop,
      durationSec: dur,
      fps: FPS,
      frameCount: durationInFrames,
    };
  }

  // ── Poll for completion ──────────────────────────────────────────────
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { data: row } = await supabase
      .from("video_renders")
      .select("status, video_url, error_message")
      .eq("render_id", renderId)
      .maybeSingle();
    const status = String((row as any)?.status ?? "");
    const url = String((row as any)?.video_url ?? "");
    if (status === "completed" && url) {
      return {
        ok: true,
        preclipUrl: url,
        preclipRenderId: renderId,
        crop,
        durationSec: dur,
        fps: FPS,
        frameCount: durationInFrames,
      };
    }
    if (status === "failed") {
      return {
        ok: false,
        error: `lambda:${(row as any)?.error_message ?? "unknown"}`.slice(0, 300),
        errorClass: "lambda_failed",
        preclipRenderId: renderId,
        crop,
        durationSec: dur,
        fps: FPS,
        frameCount: durationInFrames,
      };
    }
  }

  return {
    ok: false,
    error: `poll_timeout_${Math.round(pollTimeoutMs / 1000)}s`,
    errorClass: "poll_timeout",
    preclipRenderId: renderId,
    crop,
    durationSec: dur,
    fps: FPS,
    frameCount: durationInFrames,
  };
}
